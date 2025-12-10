import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Plus, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
];

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência Bancária' },
  { value: 'installments', label: 'Parcelado' },
];

const packageSchema = z.object({
  template_id: z.string().optional(),
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  client_id: z.string().min(1, 'Selecione um cliente'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sessão').max(100, 'Máximo 100 sessões'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  duration: z.coerce.number().min(15, 'Mínimo 15 minutos').max(480, 'Máximo 8 horas'),
  auto_schedule: z.boolean(),
  preferred_day_of_week: z.string().optional(),
  preferred_time: z.string().optional(),
  total_price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  payment_methods: z.array(z.string()).min(1, 'Selecione pelo menos uma forma de pagamento'),
  whatsapp_reminder: z.boolean(),
  professional_id: z.string().optional(),
  room_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;

interface NewPackageDialogProps {
  onPackageCreated?: () => void;
  children?: React.ReactNode;
}

export function NewPackageDialog({ onPackageCreated, children }: NewPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { clients } = useClients();
  const { templates } = usePackageTemplates();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      template_id: '',
      name: '',
      description: '',
      client_id: '',
      total_sessions: 10,
      interval_days: 7,
      duration: 60,
      auto_schedule: false,
      preferred_day_of_week: '',
      preferred_time: '',
      total_price: 0,
      payment_methods: [],
      whatsapp_reminder: true,
      professional_id: '',
      room_id: '',
      equipment: [],
    },
  });

  const autoSchedule = form.watch('auto_schedule');
  const selectedTemplateId = form.watch('template_id');
  const paymentMethods = form.watch('payment_methods');

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        form.setValue('name', template.name);
        form.setValue('description', template.description || '');
        form.setValue('total_sessions', template.total_sessions);
        form.setValue('total_price', template.price);
        form.setValue('duration', template.duration);
        form.setValue('interval_days', template.interval_days || 7);
        form.setValue('professional_id', template.professional_id || '');
        form.setValue('room_id', template.room_id || '');
        form.setValue('equipment', template.equipment || []);
      }
    }
  }, [selectedTemplateId, templates, form]);

  const onSubmit = async (data: PackageFormData) => {
    setIsLoading(true);
    try {
      const { data: pkg, error: pkgError } = await supabase
        .from('service_packages')
        .insert({
          name: data.name,
          description: data.description || null,
          client_id: data.client_id,
          template_id: data.template_id || null,
          total_sessions: data.total_sessions,
          sessions_scheduled: 0,
          interval_days: data.interval_days,
          duration: data.duration,
          auto_schedule: data.auto_schedule,
          preferred_day_of_week: data.preferred_day_of_week ? parseInt(data.preferred_day_of_week) : null,
          preferred_time: data.preferred_time || null,
          total_price: data.total_price,
          payment_method: data.payment_methods[0], // Keep first for backwards compat
          payment_methods: data.payment_methods,
          whatsapp_reminder: data.whatsapp_reminder,
          professional_id: data.professional_id || null,
          room_id: data.room_id || null,
          equipment: data.equipment || [],
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      // Create pending package appointments for tracking
      const packageAppointments = Array.from({ length: data.total_sessions }, (_, i) => ({
        package_id: pkg.id,
        session_number: i + 1,
        status: 'pending' as const,
      }));

      const { error: appointmentsError } = await supabase
        .from('package_appointments')
        .insert(packageAppointments);

      if (appointmentsError) throw appointmentsError;

      toast.success('Pacote cadastrado com sucesso!');
      form.reset();
      setOpen(false);
      onPackageCreated?.();
    } catch (error: any) {
      toast.error('Erro ao cadastrar pacote: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePaymentMethod = (method: string) => {
    const current = form.getValues('payment_methods');
    if (current.includes(method)) {
      form.setValue('payment_methods', current.filter(m => m !== method));
    } else {
      form.setValue('payment_methods', [...current, method]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Package className="h-4 w-4" />
            Novo Pacote
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Pacote</DialogTitle>
          <DialogDescription>
            Crie um pacote de sessões para um cliente.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Template Selection */}
            {templates.length > 0 && (
              <FormField
                control={form.control}
                name="template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pacote Pré-cadastrado (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um modelo ou preencha manualmente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Preencher manualmente</SelectItem>
                        {templates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} - {template.total_sessions} sessões - R$ {Number(template.price).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Escolha um modelo pré-cadastrado para preencher automaticamente
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} - {client.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Pacote *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 10 Aplicações Buço, Axila, Virilha e Canela" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detalhes do pacote..."
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="total_sessions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qtd. Sessões *</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interval_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervalo (dias) *</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={365} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (min) *</FormLabel>
                    <FormControl>
                      <Input type="number" min={15} max={480} step={15} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissional</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {professionals.filter(p => p.is_active).map(prof => (
                          <SelectItem key={prof.id} value={prof.id}>
                            {prof.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sala</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Nenhuma</SelectItem>
                        {rooms.filter(r => r.is_active).map(room => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="total_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Total (R$) *</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_methods"
                render={() => (
                  <FormItem>
                    <FormLabel>Formas de Pagamento *</FormLabel>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {PAYMENT_METHODS.map(method => (
                        <Badge
                          key={method.value}
                          variant={paymentMethods.includes(method.value) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => togglePaymentMethod(method.value)}
                        >
                          {method.label}
                        </Badge>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="auto_schedule"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Agendamento Automático</FormLabel>
                    <FormDescription>
                      O sistema agenda as sessões automaticamente baseado nas preferências
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {autoSchedule && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <FormField
                  control={form.control}
                  name="preferred_day_of_week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia da Semana Preferido</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DAYS_OF_WEEK.map(day => (
                            <SelectItem key={day.value} value={day.value}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="preferred_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário Preferido</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="whatsapp_reminder"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Lembrete via WhatsApp</FormLabel>
                    <FormDescription>
                      Enviar lembrete automático antes dos agendamentos
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
