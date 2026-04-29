import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, DollarSign, Users, Calendar, Home, User, Package, Layers, Timer, Pencil, Trash2, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PackageClientsList } from './PackageClientsList';
import { PackageSessionsManager } from './PackageSessionsManager';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
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
import { Tables } from '@/integrations/supabase/types';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { toast } from 'sonner';

type ServicePackage = Tables<'service_packages'>;

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  category: z.string().optional(),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sessão').max(100, 'Máximo 100 sessões'),
  total_price: z.coerce.number().min(0, 'Preço deve ser positivo').max(1000000, 'Preço muito alto'),
  duration: z.coerce.number().min(5, 'Duração mínima de 5 minutos').max(480, 'Duração máxima de 8 horas'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias'),
  room_id: z.string().optional(),
  professional_id: z.string().optional(),
  auto_schedule: z.boolean(),
  whatsapp_reminder: z.boolean(),
  is_active: z.boolean(),
});

type PackageFormData = z.infer<typeof packageSchema>;

interface PackageDetailDialogProps {
  pkg: ServicePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPackageUpdated?: () => void;
  categories?: string[];
}

export function PackageDetailDialog({ pkg, open, onOpenChange, onPackageUpdated, categories = [] }: PackageDetailDialogProps) {
  const [clientsCount, setClientsCount] = useState(0);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [equipmentNames, setEquipmentNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClientsList, setShowClientsList] = useState(false);
  const [showSessionsList, setShowSessionsList] = useState(false);

  const { rooms } = useRooms();
  const { professionals } = useProfessionals();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: pkg.name,
      description: pkg.description || '',
      category: pkg.category || '',
      total_sessions: pkg.total_sessions,
      total_price: pkg.total_price,
      duration: pkg.duration || 60,
      interval_days: pkg.interval_days || 7,
      room_id: pkg.room_id || '',
      professional_id: pkg.professional_id || '',
      auto_schedule: pkg.auto_schedule,
      whatsapp_reminder: pkg.whatsapp_reminder,
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
        total_price: pkg.total_price,
        duration: pkg.duration || 60,
        interval_days: pkg.interval_days || 7,
        room_id: pkg.room_id || '',
        professional_id: pkg.professional_id || '',
        auto_schedule: pkg.auto_schedule,
        whatsapp_reminder: pkg.whatsapp_reminder,
        is_active: pkg.is_active,
      });
      setIsEditing(false);
      setShowClientsList(false);
    }
  }, [open, pkg]);

  const fetchPackageStats = async () => {
    setIsLoading(true);
    try {
      const { count } = await supabase
        .from('service_packages')
        .select('*', { count: 'exact', head: true })
        .eq('name', pkg.name)
        .not('client_id', 'is', null);

      setClientsCount(count || 0);

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

      if (pkg.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('name')
          .eq('id', pkg.client_id)
          .single();
        setClientName(client?.name || null);
      } else {
        setClientName(null);
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
    } catch (error) {
      console.error('Error fetching package stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: PackageFormData) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('service_packages')
        .update({
          name: data.name,
          description: data.description || null,
          category: data.category || null,
          total_sessions: data.total_sessions,
          total_price: data.total_price,
          duration: data.duration,
          interval_days: data.interval_days,
          room_id: data.room_id || null,
          professional_id: data.professional_id || null,
          auto_schedule: data.auto_schedule,
          whatsapp_reminder: data.whatsapp_reminder,
          is_active: data.is_active,
        })
        .eq('id', pkg.id);

      if (error) throw error;

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

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('service_packages')
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
                <DialogTitle className="text-xl">{pkg.name}</DialogTitle>
              </div>
              <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                {pkg.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </DialogHeader>

          {!isEditing ? (
            <>
              {pkg.category && (
                <Badge variant="outline" className="w-fit">{pkg.category}</Badge>
              )}

              {pkg.description && (
                <p className="text-muted-foreground">{pkg.description}</p>
              )}

              <Separator />

              {/* Usage Stats */}
              <div className="space-y-3">
                <div 
                  className="rounded-lg bg-primary/10 p-4 cursor-pointer hover:bg-primary/15 transition-colors"
                  onClick={() => setShowClientsList(!showClientsList)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="h-6 w-6 text-primary" />
                      <div className="text-left">
                        <p className="text-2xl font-bold">{isLoading ? '...' : clientsCount}</p>
                        <p className="text-xs text-muted-foreground">Clientes usando este pacote</p>
                      </div>
                    </div>
                    {clientsCount > 0 && (
                      showClientsList ? <ChevronUp className="h-5 w-5 text-primary" /> : <ChevronDown className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </div>
                
                {showClientsList && clientsCount > 0 && (
                  <PackageClientsList packageName={pkg.name} />
                )}

                {/* Sessions Management - Only show for client-specific packages */}
                {pkg.client_id && (
                  <div 
                    className="rounded-lg bg-blue-500/10 p-4 cursor-pointer hover:bg-blue-500/15 transition-colors"
                    onClick={() => setShowSessionsList(!showSessionsList)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ListChecks className="h-6 w-6 text-blue-500" />
                        <div className="text-left">
                          <p className="text-2xl font-bold">{pkg.sessions_scheduled} / {pkg.total_sessions}</p>
                          <p className="text-xs text-muted-foreground">Gerenciar Sessões</p>
                        </div>
                      </div>
                      {showSessionsList ? <ChevronUp className="h-5 w-5 text-blue-500" /> : <ChevronDown className="h-5 w-5 text-blue-500" />}
                    </div>
                  </div>
                )}
                
                {showSessionsList && pkg.client_id && (
                  <PackageSessionsManager 
                    packageId={pkg.id}
                    packageName={pkg.name}
                    totalSessions={pkg.total_sessions}
                    onSessionRescheduled={fetchPackageStats}
                  />
                )}
              </div>

              <Separator />

              {/* Package Details */}
              <div className="space-y-3">
                <h4 className="font-semibold">Detalhes do Pacote</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <DollarSign className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-xs text-muted-foreground">Valor Total</p>
                      <p className="font-semibold">R$ {Number(pkg.total_price).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Layers className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total de Sessões</p>
                      <p className="font-semibold">{pkg.total_sessions}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duração/Sessão</p>
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

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Agendamento</p>
                      <p className="font-semibold">{pkg.auto_schedule ? 'Automático' : 'Manual'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Calendar className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Sessões Agendadas</p>
                      <p className="font-semibold">{pkg.sessions_scheduled} / {pkg.total_sessions}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              {(roomName || professionalName || clientName || equipmentNames.length > 0) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-semibold">Informações Adicionais</h4>
                    
                    <div className="space-y-2">
                      {clientName && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                          <User className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Cliente</p>
                            <p className="font-semibold">{clientName}</p>
                          </div>
                        </div>
                      )}

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

              {/* WhatsApp Reminder */}
              <div className="rounded-lg border p-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Lembrete WhatsApp:</span>{' '}
                  <Badge variant={pkg.whatsapp_reminder ? 'default' : 'secondary'}>
                    {pkg.whatsapp_reminder ? 'Ativado' : 'Desativado'}
                  </Badge>
                </p>
              </div>

              <Separator />

              <div className="flex justify-between gap-2">
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
                <Button onClick={() => setIsEditing(true)}>
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
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma categoria" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="total_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor Total (R$) *</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value} onValueChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="total_sessions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Sessões *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={100} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração *</FormLabel>
                        <FormControl>
                          <DurationSelect
                            value={field.value}
                            onChange={field.onChange}
                            minDuration={15}
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
                        <FormLabel>Intervalo (dias) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={365} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="room_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sala</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma sala" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {rooms.filter(r => r.is_active).map((room) => (
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

                <FormField
                  control={form.control}
                  name="professional_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profissional</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um profissional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {professionals.filter(p => p.is_active).map((prof) => (
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
                  name="auto_schedule"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel>Agendamento Automático</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="whatsapp_reminder"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel>Lembrete WhatsApp</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel>Pacote Ativo</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
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
            <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{pkg.name}"? Esta ação não pode ser desfeita.
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
