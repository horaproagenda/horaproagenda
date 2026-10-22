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
import { NumberInput } from '@/components/ui/number-input';
import { CurrencyInput } from '@/components/ui/currency-input';
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
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { formatCurrency } from '@/lib/utils';
import { NewCategoryDialog } from './NewCategoryDialog';
import { SequentialStepsEditor, emptySequentialStep, validateSequentialSteps, serializeSequentialSteps, type SequentialStepDraft } from './SequentialStepsEditor';
import { VisibilitySelect, useRecordVisibility } from '@/components/shared/VisibilitySelect';
import { DEFAULT_RECORD_VISIBILITY } from '@/lib/permissions';
import { useEstablishment } from '@/hooks/useEstablishment';
import { suggestedServiceCategories } from '@/lib/segmentTemplates';

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  category: z.string().trim().min(1, 'Selecione uma categoria'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 aplicação').max(100, 'Máximo 100 aplicações'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  // Para sequencial, "duration" é a soma das etapas (pode ultrapassar 8h).
  duration: z.coerce.number().min(15, 'Mínimo 15 minutos').max(48000, 'Duração total muito longa'),
  price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  professional_id: z.string().optional(),
  room_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;


interface NewPackageDialogProps {
  onPackageCreated?: () => void;
  children?: React.ReactNode;
  initialType?: 'standard' | 'sequential';
  lockType?: boolean;
}

const DEFAULT_CATEGORIES = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

export function NewPackageDialog({ onPackageCreated, children, initialType = 'standard', lockType = false }: NewPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recordVis = useRecordVisibility('servicos');
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const est = useEstablishment();
  const categories = Array.from(new Set([...(suggestedServiceCategories(est.type) ?? DEFAULT_CATEGORIES), ...customCategories]));
  const [packageType, setPackageType] = useState<'standard' | 'sequential'>(initialType);
  useEffect(() => { if (open) setPackageType(initialType); }, [open, initialType]);
  const [steps, setSteps] = useState<SequentialStepDraft[]>([emptySequentialStep(), emptySequentialStep()]);

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

  // Profissional (não administrador) só pode criar pacotes vinculados a si mesmo.
  const { professionalId: ownProfessionalId, isProfessional } = useCurrentProfessional();
  useEffect(() => {
    if (open && isProfessional && ownProfessionalId) {
      form.setValue('professional_id', ownProfessionalId);
    }
  }, [open, isProfessional, ownProfessionalId, form]);

  // Com apenas um profissional ou uma sala cadastrada, já vem preenchido.
  const activeProfessionalsList = professionals.filter(p => p.is_active);
  const activeRoomsList = rooms.filter(r => r.is_active);
  useEffect(() => {
    if (!open) return;
    const currentProfessional = form.getValues('professional_id');
    if (activeProfessionalsList.length === 1 && (!currentProfessional || currentProfessional === '_none')) {
      form.setValue('professional_id', activeProfessionalsList[0].id, { shouldValidate: false });
    }
    const currentRoom = form.getValues('room_id');
    if (activeRoomsList.length === 1 && (!currentRoom || currentRoom === '_none')) {
      form.setValue('room_id', activeRoomsList[0].id, { shouldValidate: false });
    }
  }, [open, activeProfessionalsList, activeRoomsList, form]);

  const watchPrice = form.watch('price');
  const watchTotalSessions = form.watch('total_sessions');
  const watchProfessionalId = form.watch('professional_id');
  const watchRoomId = form.watch('room_id');
  const effectiveSessions = packageType === 'sequential' ? steps.length : watchTotalSessions;
  const pricePerSession = effectiveSessions > 0 ? watchPrice / effectiveSessions : 0;
  const onSubmit = async (data: PackageFormData) => {
    setIsLoading(true);
    try {
      if (packageType === 'standard' && (!data.professional_id || data.professional_id === '_none')) {
        toast.error('Selecione o profissional responsável.'); setIsLoading(false); return;
      }
      if (packageType === 'sequential') {
        const stepError = validateSequentialSteps(steps, activeRoomsList.length > 0);
        if (stepError) { toast.error(stepError); setIsLoading(false); return; }
      }
      const expandedSteps = packageType === 'sequential' ? steps : [];
      const sequentialDuration = packageType === 'sequential'
        ? Math.max(15, Math.max(...steps.map(st => st.duration_minutes || 0)))
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
          professional_id: packageType === 'sequential'
            ? (steps[0]?.professional_id || null)
            : (data.professional_id && data.professional_id !== '_none' ? data.professional_id : null),
          room_id: packageType === 'sequential' ? null : (data.room_id && data.room_id !== '_none' ? data.room_id : null),
          equipment: packageType === 'sequential' ? null : (data.equipment && data.equipment.length > 0 ? data.equipment : null),
          is_active: true,
          ...recordVis.visibilityField,
        })
        .select()
        .single();

      if (error) throw error;

      if (packageType === 'sequential' && template) {
        const { error: stepsError } = await (supabase as any)
          .from('package_template_steps')
          .insert(serializeSequentialSteps(template.id, expandedSteps));

        if (stepsError) throw stepsError;
      }

      toast.success('Pacote cadastrado!');
      form.reset();
      setPackageType(initialType);
      recordVis.setVisibility(DEFAULT_RECORD_VISIBILITY);
      setSteps([emptySequentialStep(), emptySequentialStep()]);
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
          <DialogTitle className="text-base">{packageType === 'sequential' ? 'Novo Pacote Sequencial' : 'Novo Pacote Comum'}</DialogTitle>
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
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs">Categoria *</FormLabel>
                      <NewCategoryDialog
                        existingCategories={categories}
                        onCategoryCreated={(cat) => {
                          setCustomCategories((prev) => [...prev, cat]);
                          field.onChange(cat);
                        }}
                      >
                        <button type="button" className="text-[10px] text-primary hover:underline">
                          + Nova
                        </button>
                      </NewCategoryDialog>
                    </div>
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



            {/* Info: o que é cada tipo de pacote */}
            <div className={
              packageType === 'sequential'
                ? 'flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-[11px] leading-relaxed text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary-foreground'
                : 'flex items-start gap-2 rounded-md border border-accent/30 bg-accent/60 p-2.5 text-[11px] leading-relaxed text-accent dark:border-accent/40 dark:bg-accent/30 dark:text-accent/80'
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
                        <NumberInput min={1} max={100} className="h-8 text-sm" value={field.value ?? null} onValueChange={(v) => field.onChange(v)} />
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
                        <NumberInput min={1} max={365} className="h-8 text-sm" value={field.value ?? null} onValueChange={(v) => field.onChange(v)} />
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
                No pacote sequencial, cada etapa é preenchida à mão, com nome, duração, profissional, sala, equipamento e intervalo próprios — sem vínculo com os serviços cadastrados.
              </div>
            )}

            {packageType === 'sequential' && (
              <SequentialStepsEditor
                steps={steps}
                onChange={setSteps}
                professionals={activeProfessionalsList.map(p => ({ id: p.id, name: p.name }))}
                rooms={activeRoomsList.map(r => ({ id: r.id, name: r.name }))}
                equipment={equipment.filter(e => e.is_active).map(e => ({ id: e.id, name: e.name }))}
              />
            )}

            {/* Professional & Room (pacote sequencial: preenchidos em cada etapa) */}
            {packageType === 'standard' && <>
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
            </>}

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
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Valor total do pacote sequencial (R$) *</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onValueChange={(v) => field.onChange(v)}
                        className="h-8 text-sm"
                      />
                    </FormControl>
                    {packageType === 'sequential' && <p className="text-[10px] text-muted-foreground pt-0.5">Informe o valor cobrado pelo pacote completo.</p>}
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
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
            {packageType === 'standard' && <FormField
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
            />}

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
                {isLoading ? 'Salvando...' : 'Criar Pacote'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
