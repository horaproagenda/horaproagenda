import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, DollarSign, Users, Calendar, RotateCcw, Home, User, Pencil, Trash2, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Service } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryColor } from '@/lib/categoryColors';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface ServiceAppointment {
  id: string;
  start_time: string;
  status: string;
  client: { id: string; name: string } | null;
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

interface ServiceDetailDialogProps {
  service: Service;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onServiceUpdated?: () => void;
}

export function ServiceDetailDialog({ service, open, onOpenChange, categories, onServiceUpdated }: ServiceDetailDialogProps) {
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [clientsCount, setClientsCount] = useState(0);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [equipmentNames, setEquipmentNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [serviceAppointments, setServiceAppointments] = useState<ServiceAppointment[]>([]);
  const [showAppointments, setShowAppointments] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [serviceClients, setServiceClients] = useState<{id: string; name: string; count: number}[]>([]);

  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment: allEquipment } = useEquipment();

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service.name,
      description: service.description || '',
      duration: service.duration,
      price: service.price,
      category: service.category,
      room_id: service.room_id || '',
      professional_id: service.professional_id || '',
      equipment: service.equipment || [],
      return_days: service.return_days,
      is_active: service.is_active,
    },
  });

  useEffect(() => {
    if (open) {
      fetchServiceStats();
      form.reset({
        name: service.name,
        description: service.description || '',
        duration: service.duration,
        price: service.price,
        category: service.category,
        room_id: service.room_id || '',
        professional_id: service.professional_id || '',
        equipment: service.equipment || [],
        return_days: service.return_days,
        is_active: service.is_active,
      });
      setIsEditing(false);
    }
  }, [open, service]);

  const fetchServiceStats = async () => {
    setIsLoading(true);
    try {
      const { count: apptCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', service.id);

      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, client_id, start_time, status, client:clients(id, name)')
        .eq('service_id', service.id)
        .order('start_time', { ascending: false })
        .limit(50);

      const uniqueClients = new Set(appointments?.map(a => a.client_id) || []);
      setServiceAppointments(appointments?.map(a => ({
        id: a.id,
        start_time: a.start_time,
        status: a.status,
        client: a.client,
      })) || []);

      // Build client list with counts
      const clientMap = new Map<string, { id: string; name: string; count: number }>();
      appointments?.forEach(a => {
        if (a.client) {
          const existing = clientMap.get(a.client.id);
          if (existing) {
            existing.count++;
          } else {
            clientMap.set(a.client.id, { id: a.client.id, name: a.client.name, count: 1 });
          }
        }
      });
      setServiceClients(Array.from(clientMap.values()).sort((a, b) => b.count - a.count));

      if (service.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', service.room_id)
          .single();
        setRoomName(room?.name || null);
      } else {
        setRoomName(null);
      }

      if (service.professional_id) {
        const { data: professional } = await supabase
          .from('professionals')
          .select('name')
          .eq('id', service.professional_id)
          .single();
        setProfessionalName(professional?.name || null);
      } else {
        setProfessionalName(null);
      }

      // Fetch equipment names
      if (service.equipment && service.equipment.length > 0) {
        const { data: equipmentData } = await supabase
          .from('equipment')
          .select('name')
          .in('id', service.equipment);
        setEquipmentNames(equipmentData?.map(e => e.name) || []);
      } else {
        setEquipmentNames([]);
      }

      setAppointmentsCount(apptCount || 0);
      setClientsCount(uniqueClients.size);
    } catch (error) {
      console.error('Error fetching service stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAppointment = async (appointmentId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);
      
      if (error) throw error;
      
      toast.success('Agendamento excluído!');
      fetchServiceStats();
    } catch (error: any) {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    }
  };

  const onSubmit = async (data: ServiceFormData) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('services')
        .update({
          name: data.name,
          description: data.description || null,
          duration: data.duration,
          price: data.price,
          category: data.category,
          room_id: data.room_id || null,
          professional_id: data.professional_id || null,
          equipment: data.equipment || [],
          return_days: data.return_days || null,
          is_active: data.is_active,
        })
        .eq('id', service.id);

      if (error) throw error;

      toast.success('Serviço atualizado com sucesso!');
      setIsEditing(false);
      onServiceUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar serviço: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      // Check for dependencies first
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('service_id', service.id)
        .limit(1);
      
      if (appointments && appointments.length > 0) {
        toast.error('Não é possível excluir: serviço possui agendamentos vinculados.');
        setShowDeleteDialog(false);
        return;
      }

      const { data: serviceProducts } = await supabase
        .from('service_products')
        .select('id')
        .eq('service_id', service.id)
        .limit(1);
      
      if (serviceProducts && serviceProducts.length > 0) {
        // Delete service products first
        await supabase
          .from('service_products')
          .delete()
          .eq('service_id', service.id);
      }

      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', service.id);

      if (error) throw error;

      toast.success('Serviço excluído com sucesso!');
      onServiceUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Não é possível excluir: serviço possui dados vinculados no sistema.');
      } else {
        toast.error('Erro ao excluir serviço: ' + error.message);
      }
    }
    setShowDeleteDialog(false);
  };

  const categoryColor = getCategoryColor(service.category);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl">{service.name}</DialogTitle>
                <Badge 
                  variant="outline" 
                  className="mt-2"
                  style={{ backgroundColor: `${categoryColor.hex}15`, borderColor: `${categoryColor.hex}40` }}
                >
                  {service.category}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={service.is_active ? 'default' : 'secondary'}>
                  {service.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          {!isEditing ? (
            <>
              {service.description && (
                <p className="text-muted-foreground">{service.description}</p>
              )}

              <Separator />

              {/* Usage Stats - Clickable */}
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className="rounded-lg bg-primary/10 p-4 text-center cursor-pointer hover:bg-primary/15 transition-colors"
                  onClick={() => clientsCount > 0 && setShowClients(!showClients)}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Users className="h-6 w-6 text-primary" />
                    {clientsCount > 0 && (showClients ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                  </div>
                  <p className="mt-2 text-2xl font-bold">{isLoading ? '...' : clientsCount}</p>
                  <p className="text-xs text-muted-foreground">Clientes usando</p>
                </div>
                <div 
                  className="rounded-lg bg-secondary/50 p-4 text-center cursor-pointer hover:bg-secondary/60 transition-colors"
                  onClick={() => appointmentsCount > 0 && setShowAppointments(!showAppointments)}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Calendar className="h-6 w-6 text-secondary-foreground" />
                    {appointmentsCount > 0 && (showAppointments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                  </div>
                  <p className="mt-2 text-2xl font-bold">{isLoading ? '...' : appointmentsCount}</p>
                  <p className="text-xs text-muted-foreground">Agendamentos</p>
                </div>
              </div>

              {/* Clients List */}
              {showClients && serviceClients.length > 0 && (
                <ScrollArea className="h-[150px] rounded border p-2">
                  <div className="space-y-2">
                    {serviceClients.map(client => (
                      <div key={client.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm font-medium">{client.name}</span>
                        <Badge variant="secondary" className="text-xs">{client.count} atendimento{client.count > 1 ? 's' : ''}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Appointments History */}
              {showAppointments && serviceAppointments.length > 0 && (
                <ScrollArea className="h-[200px] rounded border p-2">
                  <div className="space-y-2">
                    {serviceAppointments.map(apt => (
                      <div key={apt.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{apt.client?.name || 'Cliente'}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge variant={apt.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                          {apt.status === 'scheduled' ? 'Agendado' : 
                           apt.status === 'confirmed' ? 'Confirmado' : 
                           apt.status === 'completed' ? 'Concluído' : 
                           apt.status === 'cancelled' ? 'Cancelado' : apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <Separator />

              {/* Service Details */}
              <div className="space-y-3">
                <h4 className="font-semibold">Detalhes do Serviço</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <DollarSign className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="font-semibold">{formatCurrency(Number(service.price || 0))}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duração</p>
                      <p className="font-semibold">{service.duration} min</p>
                    </div>
                  </div>

                  {service.return_days && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                      <RotateCcw className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Retorno</p>
                        <p className="font-semibold">{service.return_days} dias</p>
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

                  {professionalName && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 col-span-2">
                      <User className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Profissional</p>
                        <p className="font-semibold">{professionalName}</p>
                      </div>
                    </div>
                  )}

                  {equipmentNames.length > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Wrench className="h-5 w-5 text-orange-500" />
                        <p className="text-xs text-muted-foreground">Equipamentos</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {equipmentNames.map((name, idx) => (
                          <Badge key={idx} variant="outline">{name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>


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
                      <FormLabel>Categoria *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma categoria" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
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
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor *</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value} onValueChange={field.onChange} />
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
                        <FormLabel>Duração *</FormLabel>
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
                </div>

                <FormField
                  control={form.control}
                  name="return_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retorno (dias)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0} 
                          max={365} 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
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

                {/* Equipment Selection */}
                {allEquipment.filter(e => e.is_active).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Equipamentos</Label>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                      <div className="flex flex-wrap gap-3">
                        {allEquipment.filter(e => e.is_active).map((eq) => (
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
                      <div className="space-y-0.5">
                        <FormLabel>Serviço Ativo</FormLabel>
                      </div>
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
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{service.name}"? Esta ação não pode ser desfeita.
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
