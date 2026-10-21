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
import { NumberInput } from '@/components/ui/number-input';
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
import { useEstablishment } from '@/hooks/useEstablishment';
import { suggestedServiceCategories } from '@/lib/segmentTemplates';
import { Badge } from '@/components/ui/badge';
import { X, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { buildSequentialServiceColorMap, getSequentialServiceColor } from '@/lib/sequentialPackageColors';
import { VisibilitySelect, useRecordVisibility } from '@/components/shared/VisibilitySelect';
import { DEFAULT_RECORD_VISIBILITY } from '@/lib/permissions';
import { KitStepsEditor } from './KitStepsEditor';
import { emptyKitStep, kitTotalPrice as sumKitPrice, serializeKitSteps, validateKitSteps, type KitStep } from '@/lib/kitSteps';

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

const DEFAULT_SERVICE_CATEGORIES = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

interface NewServiceDialogProps {
  onServiceCreated?: () => void;
  children?: React.ReactNode;
  /** When set, locks the dialog to a single mode: 'service' (plain service, kit section hidden) or 'kit' (kit section only, starts with 1 empty step). */
  lockType?: 'service' | 'kit';
}

export function NewServiceDialog({ onServiceCreated, children, lockType }: NewServiceDialogProps) {
  const est = useEstablishment();
  const categories = suggestedServiceCategories(est.type) ?? DEFAULT_SERVICE_CATEGORIES;
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recordVis = useRecordVisibility('servicos');
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();
  const { activeServices } = useServices();
  const { professionalId } = useCurrentProfessional();
  const { hasRole } = useAuth();
  
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');
  const queryClient = useQueryClient();
  const [commissionOverride, setCommissionOverride] = useState<CommissionOverride>(defaultCommissionOverride);
  const [components, setComponents] = useState<KitStep[]>([]);
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
      setComponents((prev) => (prev.length > 0 ? prev : [emptyKitStep(true)]));
    } else if (lockType === 'service') {
      setComponents([]);
    }
  }, [open, lockType]);

  const isKit = lockType === 'kit' || components.length > 0;

  // Preenchimento automático quando existe apenas um profissional ou uma sala ativa.
  const activeProfessionalsList = professionals.filter(p => p.is_active);
  const activeRoomsList = rooms.filter(r => r.is_active);
  React.useEffect(() => {
    if (!open) return;
    if (activeProfessionalsList.length === 1 && !form.getValues('professional_id')) {
      form.setValue('professional_id', activeProfessionalsList[0].id);
    }
    if (activeRoomsList.length === 1 && !form.getValues('room_id')) {
      form.setValue('room_id', activeRoomsList[0].id);
    }
  }, [open, activeProfessionalsList, activeRoomsList, form]);
  const kitTotalDuration = components.reduce((sum, c) => sum + (Number(c.duration_minutes) || 0), 0);
  const kitTotalPrice = sumKitPrice(components);

  const onSubmit = async (data: ServiceFormData) => {
    if (lockType === 'kit' && components.length === 0) {
      toast.error('Adicione pelo menos uma etapa ao kit.');
      return;
    }
    const compError = isKit ? validateKitSteps(components, activeRoomsList.length > 0) : null;
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
        ...recordVis.visibilityField,
        component_service_ids: [],
        service_components: isKit ? serializeKitSteps(components) : [],
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
      recordVis.setVisibility(DEFAULT_RECORD_VISIBILITY);
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
          <DialogTitle className="text-base">{lockType === 'kit' ? 'Novo Kit de Serviços' : 'Novo Serviço'}</DialogTitle>
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
              <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
                Valor total do kit (soma das etapas): <span className="font-semibold text-foreground">R$ {kitTotalPrice.toFixed(2)}</span>
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
                        <NumberInput
                          min={0}
                          max={365}
                          placeholder="30"
                          className="h-8 text-sm"
                          value={field.value ?? null}
                          onValueChange={(v) => field.onChange(v)}
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

            {lockType !== 'service' && (isKit || lockType === undefined) && (
              isKit ? (
                <KitStepsEditor
                  steps={components}
                  onChange={setComponents}
                  professionals={activeProfessionalsList}
                  rooms={activeRoomsList}
                  equipment={equipment.filter(e => e.is_active)}
                />
              ) : (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setComponents([emptyKitStep(true)])}>
                  Transformar em kit de serviços
                </Button>
              )
            )}

            {/* Equipment */}
            {!isKit && <div className="space-y-1.5">
              <Label className="text-xs">Equipamentos</Label>
              <div className="border rounded-md p-2 max-h-24 overflow-y-auto">
                {equipment.filter(e => e.is_active).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum equipamento cadastrado. Cadastre em Configurações › Equipamentos para vincular ao serviço.
                  </p>
                ) : (
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
                )}
              </div>
            </div>}

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

            <VisibilitySelect
              module="servicos"
              value={recordVis.visibility}
              onChange={recordVis.setVisibility}
              disabled={isLoading}
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
