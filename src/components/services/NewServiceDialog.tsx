import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ProfessionalCommissionField,
  saveCommissionOverride,
  defaultCommissionOverride,
  type CommissionOverride,
} from './ProfessionalCommissionField';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DurationSelect } from '@/components/ui/duration-select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { useServices } from '@/hooks/useServices';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { X, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';

function validateComponents(comps: { service_id: string; interval_days: number; price: number }[]): string | null {
  if (!comps.length) return null;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (!c.service_id) return `Etapa ${i + 1}: selecione um serviço.`;
    if (!Number.isFinite(c.interval_days) || c.interval_days < 0 || c.interval_days > 365) {
      return `Etapa ${i + 1}: intervalo inválido (0 a 365 dias).`;
    }
    if (i === 0 && c.interval_days !== 0) return 'A primeira etapa do kit deve ter intervalo 0 (início).';
    if (!Number.isFinite(c.price) || c.price < 0) return `Etapa ${i + 1}: valor inválido.`;
  }
  return null;
}

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  duration: z.coerce.number().min(5, 'Duração mínima de 5 minutos').max(480, 'Duração máxima de 8 horas'),
  price: z.coerce.number().min(0, 'Preço deve ser positivo').max(100000, 'Preço muito alto'),
  category: z.string().trim().min(1, 'Selecione uma categoria'),
  room_id: z.string().optional(),
  professional_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  return_days: z.coerce.number().min(0).max(365).optional().nullable(),
  is_active: z.boolean(),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const categories = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

interface NewServiceDialogProps {
  onServiceCreated?: () => void;
  children?: React.ReactNode;
  /** When set, locks the dialog to a single mode: 'service' (plain service, kit section hidden) or 'kit' (kit section only, starts with 1 empty step). */
  lockType?: 'service' | 'kit';
}

export function NewServiceDialog({ onServiceCreated, children, lockType }: NewServiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();
  const { activeServices } = useServices();
  const { professionalId } = useCurrentProfessional();
  const { hasRole } = useAuth();
  
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');
  const queryClient = useQueryClient();
  const [commissionOverride, setCommissionOverride] = useState<CommissionOverride>(defaultCommissionOverride);
  type CompositeComponent = { service_id: string; interval_days: number; price: number };
  const [components, setComponents] = useState<CompositeComponent[]>([]);
  const [componentPicker, setComponentPicker] = useState<string>('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      duration: 60,
      price: 0,
      category: '',
      room_id: '',
      professional_id: '',
      equipment: [],
      return_days: null,
      is_active: true,
    },
  });

  // When opening in kit mode, seed first empty step so UI is consistent.
  // When opening in service mode, clear any leftover steps.
  // Always reset when dialog re-opens.
  React.useEffect(() => {
    if (!open) return;
    if (lockType === 'kit') {
      setComponents((prev) => (prev.length > 0 ? prev : [{ service_id: '', interval_days: 0, price: 0 }]));
    } else if (lockType === 'service') {
      setComponents([]);
    }
  }, [open, lockType]);

  const isKit = lockType === 'kit' || components.length > 0;
  const kitTotalDuration = components.reduce((sum, c) => sum + (Number(activeServices.find(s => s.id === c.service_id)?.duration) || 0), 0);
  const kitTotalPrice = components.reduce((sum, c) => sum + Number(c.price || 0), 0);

  const onSubmit = async (data: ServiceFormData) => {
    const compError = validateComponents(components);
    if (compError) {
      toast.error(compError);
      return;
    }
    setIsLoading(true);
    try {
      let assignedProfessionalId: string | null = null;
      if (isAdminOrReceptionist) {
        assignedProfessionalId = data.professional_id || null;
      } else {
        assignedProfessionalId = professionalId;
      }

      const { data: created, error } = await supabase.from('services').insert({
        name: data.name,
        description: data.description || null,
        duration: isKit ? Math.max(5, kitTotalDuration) : data.duration,
        price: isKit ? kitTotalPrice : data.price,
        category: data.category,
        room_id: data.room_id || null,
        professional_id: assignedProfessionalId,
        equipment: data.equipment || [],
        return_days: isKit ? null : (data.return_days || null),
        is_active: data.is_active,
        component_service_ids: components.map(c => c.service_id),
        service_components: components,
      } as any).select('id').single();

      if (error) throw error;

      // Save per-service commission override if defined
      if (assignedProfessionalId && created?.id && commissionOverride.enabled) {
        try {
          await saveCommissionOverride(assignedProfessionalId, created.id, commissionOverride);
          queryClient.invalidateQueries({ queryKey: ['professional_service_commissions_all'] });
        } catch (err: any) {
          toast.error('Serviço criado, mas comissão não foi salva: ' + err.message);
        }
      }

      toast.success('Serviço cadastrado!');
      form.reset();
      setCommissionOverride(defaultCommissionOverride);
      setComponents([]);
      setOpen(false);
      onServiceCreated?.();
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
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Novo Serviço</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Serviço</DialogTitle>
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
                      <Input placeholder="Ex: Corte de Cabelo" className="h-8 text-sm" {...field} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Duration, Price, Return */}
            {isKit ? (
              <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Kit de serviços ativo</p>
                <p>Duração, valor e retorno são calculados automaticamente a partir das etapas:</p>
                <ul className="grid grid-cols-3 gap-1 pt-1">
                  <li><span className="block text-[10px] uppercase">Duração total</span><span className="text-sm font-semibold text-foreground">{kitTotalDuration} min</span></li>
                  <li><span className="block text-[10px] uppercase">Valor total</span><span className="text-sm font-semibold text-foreground">R$ {kitTotalPrice.toFixed(2)}</span></li>
                  <li><span className="block text-[10px] uppercase">Retorno</span><span className="text-sm font-semibold text-foreground">por etapa</span></li>
                </ul>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
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
                          minDuration={5}
                          maxDuration={480}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Valor *</FormLabel>
                      <FormControl>
                        <CurrencyInput value={field.value} onValueChange={field.onChange} className="h-8 text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="return_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Retorno (dias)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          placeholder="30"
                          className="h-8 text-sm"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Professional & Room */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Profissional</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" className="text-sm">Nenhum</SelectItem>
                        {professionals.filter(p => p.is_active).map((prof) => (
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
                    <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" className="text-sm">Nenhuma</SelectItem>
                        {rooms.filter(r => r.is_active).map((room) => (
                          <SelectItem key={room.id} value={room.id} className="text-sm">{room.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Per-service commission override */}
            {(isAdminOrReceptionist ? form.watch('professional_id') : professionalId) && (
              <ProfessionalCommissionField
                professionalId={isAdminOrReceptionist ? form.watch('professional_id') : professionalId}
                value={commissionOverride}
                onChange={setCommissionOverride}
              />
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
                      placeholder="Detalhes do serviço..."
                      className="resize-none h-16 text-sm"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {/* Kit composto: sequência de serviços (igual pacote sequencial), com valor por etapa */}
            <div className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Kit de serviços (sequencial)</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => setComponents(prev => [...prev, {
                    service_id: '',
                    interval_days: prev.length === 0 ? 0 : 7,
                    price: 0,
                  }])}>
                  <Plus className="h-3 w-3" /> Etapa
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Defina a sequência de serviços (pode repetir o mesmo serviço). Ao agendar, o sistema cria um agendamento para cada etapa respeitando o intervalo. Cada etapa é cobrada separadamente.
              </p>
              {components.length > 0 && (
                <div className="space-y-1.5">
                  {components.map((c, idx) => (
                    <div key={idx} className="rounded border bg-muted/40 p-1.5 space-y-1">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px] h-5">{idx + 1}</Badge>
                        <div className="flex-1">
                          <Select
                            value={c.service_id || '_none'}
                            onValueChange={(v) => setComponents(prev => prev.map((it, i) =>
                              i === idx ? { ...it, service_id: v === '_none' ? '' : v, price: it.price || Number(activeServices.find(s => s.id === v)?.price ?? 0) } : it
                            ))}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Selecione o serviço" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none" className="text-xs">Selecione</SelectItem>
                              {activeServices.map(s => (
                                <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                          disabled={idx === 0}
                          onClick={() => setComponents(prev => {
                            const arr = [...prev]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            arr[0] = { ...arr[0], interval_days: 0 };
                            return arr;
                          })}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                          disabled={idx === components.length - 1}
                          onClick={() => setComponents(prev => {
                            const arr = [...prev]; [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                            arr[0] = { ...arr[0], interval_days: 0 };
                            return arr;
                          })}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                          onClick={() => setComponents(prev => {
                            const arr = prev.filter((_, i) => i !== idx);
                            if (arr.length > 0) arr[0] = { ...arr[0], interval_days: 0 };
                            return arr;
                          })}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">
                            {idx === 0 ? 'Início (dias)' : 'Após anterior (dias)'}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            value={c.interval_days}
                            disabled={idx === 0}
                            onChange={(e) => setComponents(prev => prev.map((it, i) =>
                              i === idx ? { ...it, interval_days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) } : it
                            ))}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Valor desta etapa</Label>
                          <CurrencyInput
                            value={c.price}
                            onValueChange={(v) => setComponents(prev => prev.map((it, i) =>
                              i === idx ? { ...it, price: Math.max(0, Number(v) || 0) } : it
                            ))}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground text-right">
                    Total do kit: R$ {components.reduce((sum, c) => sum + Number(c.price || 0), 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>



            {/* Equipment */}
            {equipment.filter(e => e.is_active).length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Equipamentos</Label>
                <div className="border rounded-md p-2 max-h-20 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {equipment.filter(e => e.is_active).map((eq) => (
                      <label key={eq.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.watch('equipment')?.includes(eq.id) || false}
                          onChange={(e) => {
                            const current = form.getValues('equipment') || [];
                            if (e.target.checked) {
                              form.setValue('equipment', [...current, eq.id]);
                            } else {
                              form.setValue('equipment', current.filter(id => id !== eq.id));
                            }
                          }}
                          className="h-3 w-3 rounded"
                        />
                        {eq.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Active switch */}
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <FormLabel className="text-xs">Serviço Ativo</FormLabel>
                    <p className="text-[10px] text-muted-foreground">Visível no catálogo</p>
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
                {isLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
