import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Plus, Trash2, Info } from 'lucide-react';
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
import { CurrencyInput } from '@/components/ui/currency-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
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
import { useServices } from '@/hooks/useServices';
import { isServiceCompatibleWithPackage } from '@/lib/packageScheduling';
import { formatCurrency } from '@/lib/utils';
import { buildSequentialServiceColorMap, getSequentialServiceColor } from '@/lib/sequentialPackageColors';

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  category: z.string().trim().min(1, 'Selecione uma categoria'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 aplicação').max(100, 'Máximo 100 aplicações'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  duration: z.coerce.number().min(15, 'Mínimo 15 minutos').max(480, 'Máximo 8 horas'),
  price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  professional_id: z.string().min(1, 'Selecione o profissional').refine(v => v && v !== '_none', 'Selecione o profissional responsável'),
  room_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;

interface SequentialStep {
  service_id: string;
  interval_after_days: number;
  quantity: number;
}

interface NewPackageDialogProps {
  onPackageCreated?: () => void;
  children?: React.ReactNode;
  initialType?: 'standard' | 'sequential';
  lockType?: boolean;
}

const categories = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

export function NewPackageDialog({ onPackageCreated, children, initialType = 'standard', lockType = false }: NewPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();
  const { activeServices } = useServices();
  const [packageType, setPackageType] = useState<'standard' | 'sequential'>(initialType);
  useEffect(() => { if (open) setPackageType(initialType); }, [open, initialType]);
  const [steps, setSteps] = useState<SequentialStep[]>([
    { service_id: '', interval_after_days: 7, quantity: 1 },
    { service_id: '', interval_after_days: 7, quantity: 1 },
  ]);
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: '',
      description: '',
      category: '',
      total_sessions: 10,
      interval_days: 7,
      duration: 60,
      price: 0,
      professional_id: '',
      room_id: '_none',
      equipment: [],
    },
  });

  const watchPrice = form.watch('price');
  const watchTotalSessions = form.watch('total_sessions');
  const watchProfessionalId = form.watch('professional_id');
  const watchRoomId = form.watch('room_id');
  const sequentialTotalCount = steps.reduce((sum, s) => sum + Math.max(1, Number(s.quantity) || 1), 0);
  const effectiveSessions = packageType === 'sequential' ? sequentialTotalCount : watchTotalSessions;
  const pricePerSession = effectiveSessions > 0 ? watchPrice / effectiveSessions : 0;
  const packageScope = {
    professional_id: watchProfessionalId && watchProfessionalId !== '_none' ? watchProfessionalId : null,
    room_id: watchRoomId && watchRoomId !== '_none' ? watchRoomId : null,
  };
  const compatibleServices = activeServices.filter(service => isServiceCompatibleWithPackage(service, packageScope));

  const sequentialTotalPrice = steps.reduce((total, step) => {
    const service = activeServices.find(s => s.id === step.service_id) as any;
    const qty = Math.max(1, Number(step.quantity) || 1);
    return total + ((Number(service?.price) || 0) * qty);
  }, 0);

  // Só recalcula o valor sugerido enquanto o profissional não tiver ajustado
  // manualmente. Assim o valor do pacote sequencial pode ser editado.
  useEffect(() => {
    if (packageType === 'sequential' && !priceManuallyEdited) {
      form.setValue('price', sequentialTotalPrice, { shouldValidate: false });
    }
  }, [packageType, sequentialTotalPrice, priceManuallyEdited, form]);

  // Agrupamento por serviço para exibir a contagem final (ex.: 4x Axila).
  const stepServiceIds = steps.map(s => s.service_id).filter(Boolean);
  const colorMap = buildSequentialServiceColorMap(stepServiceIds);
  const serviceCountEntries = (() => {
    const map = new Map<string, { name: string; quantity: number }>();
    steps.forEach(step => {
      if (!step.service_id) return;
      const svc = activeServices.find(s => s.id === step.service_id);
      if (!svc) return;
      const qty = Math.max(1, Number(step.quantity) || 1);
      const existing = map.get(step.service_id);
      if (existing) existing.quantity += qty;
      else map.set(step.service_id, { name: svc.name, quantity: qty });
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  })();

  const addStep = () => setSteps(prev => [...prev, { service_id: '', interval_after_days: 7, quantity: 1 }]);
  const removeStep = (index: number) => setSteps(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  const updateStep = (index: number, updates: Partial<SequentialStep>) => {
    setSteps(prev => prev.map((step, i) => i === index ? { ...step, ...updates } : step));
  };

  const onSubmit = async (data: PackageFormData) => {
    setIsLoading(true);
    try {
      if (packageType === 'sequential' && steps.some(step => !step.service_id)) {
        toast.error('Selecione um serviço para cada etapa do pacote sequencial.');
        setIsLoading(false);
        return;
      }

      if (packageType === 'sequential' && steps.slice(0, -1).some(step => !step.interval_after_days || step.interval_after_days < 1)) {
        toast.error('Informe intervalo de pelo menos 1 dia entre todas as etapas do pacote.');
        setIsLoading(false);
        return;
      }

      const incompatibleStep = steps.find(step => {
        const service = activeServices.find(item => item.id === step.service_id);
        return packageType === 'sequential' && !isServiceCompatibleWithPackage(service, packageScope);
      });

      if (incompatibleStep) {
        toast.error('Há etapa com serviço incompatível com o profissional ou sala do pacote.');
        setIsLoading(false);
        return;
      }

      // Expand each step by quantity into individual rows
      const expandedSteps = packageType === 'sequential'
        ? steps.flatMap(step => {
            const qty = Math.max(1, Number(step.quantity) || 1);
            return Array.from({ length: qty }, () => ({
              service_id: step.service_id,
              interval_after_days: step.interval_after_days,
            }));
          })
        : [];

      const sequentialDuration = packageType === 'sequential'
        ? expandedSteps.reduce((total, step) => total + (activeServices.find(service => service.id === step.service_id)?.duration || data.duration), 0)
        : data.duration;

      // Create in package_templates (like services catalog)
      const { data: template, error } = await (supabase as any)
        .from('package_templates')
        .insert({
          name: data.name,
          description: data.description || null,
          category: data.category,
          total_sessions: packageType === 'sequential' ? expandedSteps.length : data.total_sessions,
          interval_days: packageType === 'sequential' ? expandedSteps[0]?.interval_after_days || data.interval_days : data.interval_days,
          duration: sequentialDuration,
          price: data.price,
          package_type: packageType,
          professional_id: data.professional_id && data.professional_id !== '_none' ? data.professional_id : null,
          room_id: data.room_id && data.room_id !== '_none' ? data.room_id : null,
          equipment: data.equipment && data.equipment.length > 0 ? data.equipment : null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      if (packageType === 'sequential' && template) {
        const { error: stepsError } = await (supabase as any)
          .from('package_template_steps')
          .insert(expandedSteps.map((step, index) => ({
            template_id: template.id,
            service_id: step.service_id,
            sequence_order: index + 1,
            interval_after_days: index === expandedSteps.length - 1 ? 0 : step.interval_after_days,
          })));

        if (stepsError) throw stepsError;
      }

      toast.success('Pacote cadastrado!');
      form.reset();
      setPackageType('standard');
      setSteps([{ service_id: '', interval_after_days: 7, quantity: 1 }, { service_id: '', interval_after_days: 7, quantity: 1 }]);
      setPriceManuallyEdited(false);
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
          <DialogTitle className="text-base">{lockType ? (packageType === 'sequential' ? 'Novo Pacote Sequencial' : 'Novo Pacote Comum') : 'Novo Pacote'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 10 aplicações de laser" className="h-8 text-sm" {...field} />
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
                        {categories.map((cat) => <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {!lockType && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
                <Button type="button" variant={packageType === 'standard' ? 'default' : 'ghost'} size="sm" onClick={() => setPackageType('standard')}>
                  Pacote padrão
                </Button>
                <Button type="button" variant={packageType === 'sequential' ? 'default' : 'ghost'} size="sm" onClick={() => setPackageType('sequential')}>
                  Sequencial
                </Button>
              </div>
            )}

            {/* Info: o que é cada tipo de pacote */}
            <div className={
              packageType === 'sequential'
                ? 'flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary-foreground'
                : 'flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-2.5 text-[11px] leading-relaxed text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-100'
            }>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>
                {packageType === 'sequential'
                  ? <><strong>Pacote sequencial</strong>: serviços diferentes em ordem definida, com intervalo entre etapas. A próxima sessão só é liberada após a anterior — ideal para protocolos por etapas.</>
                  : <><strong>Pacote comum</strong>: várias sessões do mesmo serviço (ex.: 10 massagens). O cliente usa livremente até esgotar o saldo, respeitando o intervalo configurado.</>}
              </p>
            </div>


            {/* Sessions, Interval, Duration */}
            {packageType === 'standard' ? (
              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="total_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Aplicações *</FormLabel>
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
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                No pacote sequencial, <span className="font-medium text-foreground">a duração e o intervalo</span> de cada etapa vêm do próprio serviço cadastrado. O <span className="font-medium text-foreground">valor total é sugerido pela soma das etapas</span> e pode ser editado manualmente abaixo.
              </div>
            )}

            {packageType === 'sequential' && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs">Sequência de serviços</FormLabel>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addStep}>
                    <Plus className="h-3 w-3" /> Etapa
                  </Button>
                </div>
                {steps.map((step, index) => {
                  const color = getSequentialServiceColor(step.service_id, colorMap);
                  return (
                    <div key={index} className={`grid grid-cols-[16px_1fr_56px_66px_28px] gap-2 items-end rounded-md px-1 py-1 ${step.service_id ? color.bg : ''}`}>
                      <span className={`h-3 w-3 rounded-full mb-2 ${step.service_id ? color.dot : 'bg-muted'}`} aria-hidden />
                      <div className="min-w-0">
                        <FormLabel className="text-[10px]">{index + 1}º serviço</FormLabel>
                        <SearchableSelect
                          className="h-8 text-xs"
                          value={step.service_id}
                          onChange={(value) => updateStep(index, { service_id: value })}
                          options={compatibleServices.map((service: any) => ({
                            value: service.id,
                            label: service.name,
                            sublabel: service.category || undefined,
                          }))}
                          placeholder="Selecione o serviço"
                          searchPlaceholder="Buscar serviço..."
                          emptyMessage="Nenhum serviço encontrado."
                        />
                      </div>
                      <div>
                        <FormLabel className="text-[10px]">Qtd.</FormLabel>
                        <Input type="number" min={1} max={100} className="h-8 text-xs" value={step.quantity} onChange={(e) => updateStep(index, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                      </div>
                      <div>
                        <FormLabel className="text-[10px]">Após (dias)</FormLabel>
                        <Input type="number" min={0} max={365} className="h-8 text-xs" disabled={index === steps.length - 1} value={index === steps.length - 1 ? 0 : step.interval_after_days} onChange={(e) => updateStep(index, { interval_after_days: Number(e.target.value) })} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" disabled={steps.length === 1} onClick={() => removeStep(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-[10px] text-muted-foreground">
                    Total de aplicações: <span className="font-medium text-foreground">{sequentialTotalCount}</span>
                  </p>
                </div>
                {serviceCountEntries.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Total por serviço</p>
                    <div className="flex flex-wrap gap-1.5">
                      {serviceCountEntries.map(entry => {
                        const color = getSequentialServiceColor(entry.id, colorMap);
                        return (
                          <span key={entry.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${color.bg} ${color.text} ${color.border}`}>
                            <span className={`h-2 w-2 rounded-full ${color.dot}`} aria-hidden />
                            <span className="font-semibold">{entry.quantity}x</span>
                            <span>{entry.name}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Professional & Room */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Profissional *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione o profissional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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

            {/* Commission info for selected professional */}
            {watchProfessionalId && watchProfessionalId !== '_none' && (() => {
              const prof = professionals.find(p => p.id === watchProfessionalId) as any;
              if (!prof) return null;
              const type = prof.commission_type || 'percentage';
              const pct = Number(prof.commission_percentage) || 0;
              const fixed = Number(prof.commission_fixed_value) || 0;
              return (
                <div className="rounded-md border p-2 bg-muted/30 text-[11px] text-muted-foreground">
                  Comissão do profissional para este pacote:{' '}
                  <span className="font-medium text-foreground">
                    {type === 'fixed' ? `R$ ${fixed.toFixed(2)} fixo` :
                     type === 'both' ? `${pct}% + R$ ${fixed.toFixed(2)}` :
                     `${pct}%`}
                  </span>
                  . Para valores específicos por serviço dentro do pacote, edite cada serviço.
                </div>
              );
            })()}

            {/* Price */}
            {packageType === 'standard' ? (
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Valor Total (R$) *</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value} onValueChange={field.onChange} className="h-8 text-sm" />
                    </FormControl>
                    {watchTotalSessions > 0 && watchPrice > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatCurrency(pricePerSession)}/aplicação
                      </p>
                    )}
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor total do kit (soma das etapas)</span>
                  <span className="font-semibold text-foreground">{formatCurrency(sequentialTotalPrice)}</span>
                </div>
              </div>
            )}

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
            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Equipamento</FormLabel>
                  {equipment.filter(e => e.is_active).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground border rounded-md p-2">
                      Nenhum equipamento cadastrado. Cadastre em Configurações › Equipamentos para vincular ao pacote.
                    </p>
                  ) : (
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
                  )}
                  <FormMessage className="text-[10px]" />
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
