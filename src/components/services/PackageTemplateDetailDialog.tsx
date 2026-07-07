import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, DollarSign, Users, Home, User, Package, Layers, Timer, Pencil, Trash2, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DurationSelect } from '@/components/ui/duration-select';
import { supabase } from '@/integrations/supabase/client';
import { PackageTemplate } from '@/types';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { useServices } from '@/hooks/useServices';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  category: z.string().trim().min(1, 'Selecione uma categoria'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 aplicação').max(100, 'Máximo 100 aplicações'),
  price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  duration: z.coerce.number().min(5, 'Duração mínima de 5 minutos').max(480, 'Duração máxima de 8 horas'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  room_id: z.string().optional(),
  professional_id: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  is_active: z.boolean(),
});

type PackageFormData = z.infer<typeof packageSchema>;

const categories = [
  'Cabelo', 'Unhas', 'Estética', 'Massagem', 'Maquiagem', 'Depilação', 'Tratamentos', 'Outros',
];

interface PackageTemplateDetailDialogProps {
  pkg: PackageTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPackageUpdated?: () => void;
}

export function PackageTemplateDetailDialog({ pkg, open, onOpenChange, onPackageUpdated }: PackageTemplateDetailDialogProps) {
  const [soldCount, setSoldCount] = useState(0);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [equipmentNames, setEquipmentNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isSequential = pkg.package_type === 'sequential';
  const [sequentialSteps, setSequentialSteps] = useState<Array<{ service_id: string; interval_after_days: number; quantity: number }>>([]);
  const [servicesMap, setServicesMap] = useState<Record<string, { name: string; price: number; duration: number }>>({});

  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();
  const { activeServices } = useServices();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: pkg.name,
      description: pkg.description || '',
      category: pkg.category || '',
      total_sessions: pkg.total_sessions,
      price: pkg.price,
      duration: pkg.duration || 60,
      interval_days: pkg.interval_days || 7,
      room_id: pkg.room_id || '',
      professional_id: pkg.professional_id || '',
      equipment: pkg.equipment || [],
      is_active: pkg.is_active,
    },
  });

  useEffect(() => {
    if (open) {
      fetchPackageStats();
      form.reset({
        name: pkg.name,
        description: pkg.description || '',
        category: pkg.category || '',
        total_sessions: pkg.total_sessions,
        price: pkg.price,
        duration: pkg.duration || 60,
        interval_days: pkg.interval_days || 7,
        room_id: pkg.room_id || '',
        professional_id: pkg.professional_id || '',
        equipment: pkg.equipment || [],
        is_active: pkg.is_active,
      });
      setIsEditing(false);
    }
  }, [open, pkg]);

  const fetchPackageStats = async () => {
    setIsLoading(true);
    try {
      // Count how many service_packages use this template
      const { count } = await supabase
        .from('service_packages')
        .select('*', { count: 'exact', head: true })
        .eq('template_id', pkg.id);

      setSoldCount(count || 0);

      if (pkg.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', pkg.room_id)
          .single();
        setRoomName(room?.name || null);
      } else {
        setRoomName(null);
      }

      if (pkg.professional_id) {
        const { data: professional } = await supabase
          .from('professionals')
          .select('name')
          .eq('id', pkg.professional_id)
          .single();
        setProfessionalName(professional?.name || null);
      } else {
        setProfessionalName(null);
      }

      if (pkg.equipment && pkg.equipment.length > 0) {
        const { data: equipmentData } = await supabase
          .from('equipment')
          .select('name')
          .in('id', pkg.equipment);
        setEquipmentNames(equipmentData?.map(e => e.name) || []);
      } else {
        setEquipmentNames([]);
      }
      // Load sequential steps and group consecutive same-service into (qty, interval)
      if (isSequential) {
        const { data: stepsData } = await (supabase as any)
          .from('package_template_steps')
          .select('service_id, sequence_order, interval_after_days')
          .eq('template_id', pkg.id)
          .order('sequence_order', { ascending: true });

        const grouped: Array<{ service_id: string; interval_after_days: number; quantity: number }> = [];
        (stepsData || []).forEach((row: any, idx: number, arr: any[]) => {
          const isLast = idx === arr.length - 1;
          const effectiveInterval = isLast ? (grouped[grouped.length - 1]?.interval_after_days ?? Number(row.interval_after_days) ?? 7) : Number(row.interval_after_days) || 0;
          const last = grouped[grouped.length - 1];
          if (last && last.service_id === row.service_id && last.interval_after_days === effectiveInterval) {
            last.quantity += 1;
          } else {
            grouped.push({ service_id: row.service_id, interval_after_days: effectiveInterval || 7, quantity: 1 });
          }
        });
        setSequentialSteps(grouped.length > 0 ? grouped : [{ service_id: '', interval_after_days: 7, quantity: 1 }]);
      }
    } catch (error) {
      console.error('Error fetching package stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: PackageFormData) => {
    setIsSaving(true);
    try {
      let totalSessions = data.total_sessions;
      let duration = data.duration;
      let intervalDays = data.interval_days;
      let expandedSteps: Array<{ service_id: string; interval_after_days: number }> = [];

      if (isSequential) {
        if (sequentialSteps.some(s => !s.service_id)) {
          toast.error('Selecione um serviço para cada etapa.');
          setIsSaving(false);
          return;
        }
        expandedSteps = sequentialSteps.flatMap(step => {
          const qty = Math.max(1, Number(step.quantity) || 1);
          return Array.from({ length: qty }, () => ({
            service_id: step.service_id,
            interval_after_days: Number(step.interval_after_days) || 0,
          }));
        });
        totalSessions = expandedSteps.length;
        intervalDays = expandedSteps[0]?.interval_after_days || intervalDays;
        duration = expandedSteps.reduce((sum, s) => {
          const svc = activeServices.find(a => a.id === s.service_id);
          return sum + (svc?.duration || 0);
        }, 0) || duration;
      }

      const { error } = await (supabase as any)
        .from('package_templates')
        .update({
          name: data.name,
          description: data.description || null,
          category: data.category,
          total_sessions: totalSessions,
          price: data.price,
          duration,
          interval_days: intervalDays,
          room_id: data.room_id || null,
          professional_id: data.professional_id || null,
          equipment: data.equipment || [],
          is_active: data.is_active,
        })
        .eq('id', pkg.id);

      if (error) throw error;

      if (isSequential) {
        await (supabase as any).from('package_template_steps').delete().eq('template_id', pkg.id);
        const { error: stepsError } = await (supabase as any)
          .from('package_template_steps')
          .insert(expandedSteps.map((step, index) => ({
            template_id: pkg.id,
            service_id: step.service_id,
            sequence_order: index + 1,
            interval_after_days: index === expandedSteps.length - 1 ? 0 : step.interval_after_days,
          })));
        if (stepsError) throw stepsError;
      }

      toast.success('Pacote atualizado com sucesso!');
      setIsEditing(false);
      onPackageUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar pacote: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const addSeqStep = () => setSequentialSteps(prev => [...prev, { service_id: '', interval_after_days: 7, quantity: 1 }]);
  const removeSeqStep = (idx: number) => setSequentialSteps(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const updateSeqStep = (idx: number, updates: Partial<{ service_id: string; interval_after_days: number; quantity: number }>) => {
    setSequentialSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  // interval range for display
  const intervalRange = (() => {
    if (!isSequential || sequentialSteps.length === 0) return null;
    const vals = sequentialSteps
      .slice(0, sequentialSteps.length > 1 ? -1 : sequentialSteps.length)
      .map(s => Number(s.interval_after_days) || 0)
      .filter(v => v > 0);
    if (vals.length === 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return min === max ? `${min} dias` : `de ${min} a ${max} dias`;
  })();

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('package_templates')
        .delete()
        .eq('id', pkg.id);

      if (error) throw error;

      toast.success('Pacote excluído com sucesso!');
      onPackageUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao excluir pacote: ' + error.message);
    }
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">{pkg.name}</DialogTitle>
                  {pkg.category && <p className="text-xs text-muted-foreground mt-1">{pkg.category}</p>}
                </div>
              </div>
              <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                {pkg.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </DialogHeader>

          {!isEditing ? (
            <>
              {pkg.description && (
                <p className="text-muted-foreground">{pkg.description}</p>
              )}

              <Separator />

              {/* Usage Stats */}
              <div className="space-y-3">
                <div className="rounded-lg bg-primary/10 p-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <p className="text-2xl font-bold">{isLoading ? '...' : soldCount}</p>
                      <p className="text-xs text-muted-foreground">Clientes com este pacote</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Package Details */}
              <div className="space-y-3">
                <h4 className="font-semibold">Detalhes do Pacote</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Valor Total</p>
                      <p className="font-semibold">{formatCurrency(Number(pkg.price || 0))}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Layers className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total de Aplicações</p>
                      <p className="font-semibold">{pkg.total_sessions}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duração/Aplicação</p>
                      <p className="font-semibold">{pkg.duration || 60} min</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Timer className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Intervalo</p>
                      <p className="font-semibold">{pkg.interval_days || 7} dias</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 col-span-2">
                    <DollarSign className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Valor por Aplicação</p>
                      <p className="font-semibold">{formatCurrency(Number(pkg.price || 0) / Math.max(1, Number(pkg.total_sessions || 1)))}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              {(roomName || professionalName || equipmentNames.length > 0) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-semibold">Informações Adicionais</h4>
                    
                    <div className="space-y-2">
                      {professionalName && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                          <User className="h-5 w-5 text-purple-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Profissional</p>
                            <p className="font-semibold">{professionalName}</p>
                          </div>
                        </div>
                      )}

                      {roomName && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                          <Home className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Sala</p>
                            <p className="font-semibold">{roomName}</p>
                          </div>
                        </div>
                      )}

                      {equipmentNames.length > 0 && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground mb-2">Equipamentos</p>
                          <div className="flex flex-wrap gap-1">
                            {equipmentNames.map((name, idx) => (
                              <Badge key={idx} variant="outline">{name}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex justify-between gap-2">
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              </div>
            </>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Textarea {...field} className="resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma categoria" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="total_sessions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total de Aplicações</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value} onValueChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração (min)</FormLabel>
                        <FormControl>
                          <DurationSelect
                            value={field.value}
                            onChange={field.onChange}
                            minDuration={5}
                            maxDuration={480}
                          />
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
                        <FormLabel>Intervalo (dias)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="professional_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profissional</FormLabel>
                        <Select onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} value={field.value || "_none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nenhum</SelectItem>
                            {professionals.filter(p => p.is_active).map(prof => (
                              <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
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
                        <Select onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} value={field.value || "_none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nenhuma</SelectItem>
                            {rooms.filter(r => r.is_active).map(room => (
                              <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Equipment Selection */}
                {equipment.filter(e => e.is_active).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Equipamentos</Label>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                      <div className="flex flex-wrap gap-3">
                        {equipment.filter(e => e.is_active).map((eq) => (
                          <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer">
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
                              className="h-4 w-4 rounded"
                            />
                            {eq.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Status</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {field.value ? 'Pacote ativo e disponível' : 'Pacote inativo'}
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pacote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o pacote "{pkg.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
