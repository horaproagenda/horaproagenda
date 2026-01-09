import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DurationSelect } from '@/components/ui/duration-select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  category: z.string().min(1, 'Selecione uma categoria'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sessão').max(100, 'Máximo 100 sessões'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  duration: z.coerce.number().min(15, 'Mínimo 15 minutos').max(480, 'Máximo 8 horas'),
  total_price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  whatsapp_reminder: z.boolean(),
  professional_id: z.string().optional(),
  room_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;

interface NewPackageDialogProps {
  onPackageCreated?: () => void;
  children?: React.ReactNode;
  categories?: string[];
}

export function NewPackageDialog({ onPackageCreated, children, categories = [] }: NewPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: '',
      description: '',
      category: '',
      total_sessions: 10,
      interval_days: 7,
      duration: 60,
      total_price: 0,
      whatsapp_reminder: true,
      professional_id: '_none',
      room_id: '_none',
      equipment: [],
    },
  });

  const watchTotalPrice = form.watch('total_price');
  const watchTotalSessions = form.watch('total_sessions');
  const pricePerSession = watchTotalSessions > 0 ? watchTotalPrice / watchTotalSessions : 0;

  const onSubmit = async (data: PackageFormData) => {
    setIsLoading(true);
    try {
      const { data: pkg, error: pkgError } = await supabase
        .from('service_packages')
        .insert({
          name: data.name,
          description: data.description || null,
          category: data.category,
          client_id: null,
          total_sessions: data.total_sessions,
          sessions_scheduled: 0,
          interval_days: data.interval_days,
          duration: data.duration,
          auto_schedule: false,
          preferred_day_of_week: null,
          preferred_time: null,
          total_price: data.total_price,
          payment_type: 'full',
          whatsapp_reminder: data.whatsapp_reminder,
          professional_id: data.professional_id && data.professional_id !== '_none' ? data.professional_id : null,
          room_id: data.room_id && data.room_id !== '_none' ? data.room_id : null,
          equipment: data.equipment && data.equipment.length > 0 ? data.equipment : null,
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      const packageAppointments = Array.from({ length: data.total_sessions }, (_, i) => ({
        package_id: pkg.id,
        session_number: i + 1,
        status: 'pending' as const,
      }));

      const { error: appointmentsError } = await supabase
        .from('package_appointments')
        .insert(packageAppointments);

      if (appointmentsError) throw appointmentsError;

      toast.success('Pacote cadastrado!');
      form.reset();
      setOpen(false);
      onPackageCreated?.();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            <span className="text-xs">Novo Pacote</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Pacote</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Name & Category */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 10 Sessões" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Sessions, Interval, Duration */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="total_sessions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Sessões *</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="interval_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Intervalo (dias)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={365} className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Duração *</FormLabel>
                    <FormControl>
                      <DurationSelect
                        value={field.value}
                        onChange={field.onChange}
                        minDuration={15}
                        maxDuration={480}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Professional & Room */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Profissional</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none" className="text-sm">Nenhum</SelectItem>
                        {professionals.filter(p => p.is_active).map(prof => (
                          <SelectItem key={prof.id} value={prof.id} className="text-sm">{prof.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="room_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Sala</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none" className="text-sm">Nenhuma</SelectItem>
                        {rooms.filter(r => r.is_active).map(room => (
                          <SelectItem key={room.id} value={room.id} className="text-sm">{room.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Price */}
            <FormField
              control={form.control}
              name="total_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Valor Total (R$) *</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" className="h-8 text-sm" {...field} />
                  </FormControl>
                  {watchTotalSessions > 0 && watchTotalPrice > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      R$ {pricePerSession.toFixed(2)}/sessão
                    </p>
                  )}
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Descrição</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detalhes do pacote..."
                      className="resize-none h-14 text-sm"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {/* Equipment */}
            {equipment.filter(e => e.is_active).length > 0 && (
              <FormField
                control={form.control}
                name="equipment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Equipamento</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val && val !== '_none' ? [val] : [])} 
                      value={field.value?.[0] || '_none'}
                    >
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none" className="text-sm">Nenhum</SelectItem>
                        {equipment.filter(e => e.is_active).map(eq => (
                          <SelectItem key={eq.id} value={eq.id} className="text-sm">{eq.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            )}

            {/* WhatsApp Reminder */}
            <FormField
              control={form.control}
              name="whatsapp_reminder"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <FormLabel className="text-xs">Lembrete WhatsApp</FormLabel>
                    <p className="text-[10px] text-muted-foreground">Notificar sessões agendadas</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="btn-vibrant" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Criar Pacote'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
