import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateInputWithCalendar } from '@/components/ui/date-input-with-calendar';
import { Appointment } from '@/types';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { useAppointments } from '@/hooks/useAppointments';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useAppointmentLocks } from '@/hooks/useAppointmentLocks';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Trash2, Repeat, Calendar, Clock, AlertTriangle, MessageCircle, User, MapPin, Lock } from 'lucide-react';

interface EditRecurringAppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRecurringAppointmentDialog({ appointment, open, onOpenChange }: EditRecurringAppointmentDialogProps) {
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();
  const { updateAppointment, deleteAppointment } = useAppointments();
  const { rescheduleAppointmentSeries, deleteAppointmentSeries, getSeriesAppointments, propagateSeriesDates } = useRecurringAppointments();
  const { activeLock, isLockedByOther, acquireLock, releaseLock } = useAppointmentLocks(appointment?.id);

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [originalDuration, setOriginalDuration] = useState<number>(0);
  const [professionalId, setProfessionalId] = useState<string>('none');
  const [roomId, setRoomId] = useState<string>('none');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  
  // Series action states
  const [deleteType, setDeleteType] = useState<'single' | 'following' | 'all'>('single');
  const [rescheduleFollowing, setRescheduleFollowing] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  
  // Series info
  const [seriesCount, setSeriesCount] = useState(0);
  const [seriesIndex, setSeriesIndex] = useState(0);

  const isRecurringSeries = appointment?.recurring_group_id != null;
  const packageId = appointment?.package_appointment?.package_id || (appointment as any)?.package_appointment?.package?.id || null;
  const isPackageAppointment = Boolean(packageId);
  const isSeriesLike = isRecurringSeries || isPackageAppointment;

  // Load series info when dialog opens
  useEffect(() => {
    if (open && appointment?.recurring_group_id) {
      loadSeriesInfo();
    }
  }, [open, appointment?.recurring_group_id]);

  const loadSeriesInfo = async () => {
    if (!appointment?.recurring_group_id) return;
    
    try {
      const seriesAppointments = await getSeriesAppointments(appointment.recurring_group_id);
      setSeriesCount(seriesAppointments?.length || 0);
      const index = seriesAppointments?.findIndex(a => a.id === appointment.id) ?? -1;
      setSeriesIndex(index + 1);
    } catch (error) {
      console.error('Error loading series info:', error);
    }
  };

  useEffect(() => {
    if (appointment) {
      const start = parseISO(appointment.start_time);
      const end = parseISO(appointment.end_time);
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      setOriginalDuration(durationMinutes);
      setDate(format(start, 'yyyy-MM-dd'));
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(end, 'HH:mm'));
      setProfessionalId(appointment.professional_id || 'none');
      setRoomId(appointment.room_id || 'none');
      const room = rooms.find(r => r.id === appointment.room_id);
      setSelectedEquipment(room?.equipment || []);
    }
  }, [appointment, rooms]);

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    // Auto-atualiza horário de término preservando a duração original
    if (originalDuration > 0 && date && newStartTime) {
      try {
        const newStart = new Date(`${date}T${newStartTime}`);
        if (!isNaN(newStart.getTime())) {
          const newEnd = new Date(newStart.getTime() + originalDuration * 60000);
          setEndTime(format(newEnd, 'HH:mm'));
        }
      } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    if (!open || !appointment) return;
    void acquireLock();
    return () => {
      void releaseLock();
    };
  }, [acquireLock, appointment, open, releaseLock]);

  const handleSingleSubmit = async () => {
    if (!appointment) return;
    if (isLockedByOther) {
      toast.warning(`Este agendamento está sendo editado por ${activeLock?.holder_name || activeLock?.user_email || 'outro usuário'}.`);
      return;
    }

    setLoading(true);
    try {
      const start_time = new Date(`${date}T${startTime}`).toISOString();
      const end_time = new Date(`${date}T${endTime}`).toISOString();

      await updateAppointment.mutateAsync({
        id: appointment.id,
        updates: {
          start_time,
          end_time,
          professional_id: professionalId === 'none' ? null : professionalId,
          room_id: roomId === 'none' ? null : roomId,
        },
        expectedVersion: appointment.version,
      });

      await releaseLock();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeriesSubmit = async () => {
    if (!appointment) return;

    setLoading(true);
    try {
      const newStartTime = new Date(`${date}T${startTime}`);
      const newEndTime = new Date(`${date}T${endTime}`);

      if (isRecurringSeries && appointment.recurring_group_id) {
        await rescheduleAppointmentSeries.mutateAsync({
          recurring_group_id: appointment.recurring_group_id,
          original_appointment_id: appointment.id,
          new_start_time: newStartTime,
          new_end_time: newEndTime,
          reschedule_following: rescheduleFollowing,
          send_whatsapp: sendWhatsapp,
          client_phone: appointment.client?.phone,
          client_name: appointment.client?.name,
        });
      } else if (isPackageAppointment && packageId) {
        // First, update the current appointment date/time
        await updateAppointment.mutateAsync({
          id: appointment.id,
          updates: {
            start_time: newStartTime.toISOString(),
            end_time: newEndTime.toISOString(),
            professional_id: professionalId === 'none' ? null : professionalId,
            room_id: roomId === 'none' ? null : roomId,
          },
          expectedVersion: appointment.version,
        });

        // Then propagate to the following sessions of the package,
        // preserving the original interval between sessions
        if (rescheduleFollowing) {
          await propagateSeriesDates.mutateAsync({
            appointment_id: appointment.id,
            new_start_time: newStartTime,
            new_end_time: newEndTime,
            propagate_type: 'package',
            package_id: packageId,
            interval_days: (appointment as any)?.package_appointment?.package?.interval_days || undefined,
          });
          toast.success('Datas dos próximos agendamentos do pacote ajustadas!');
        }
      }

      setShowRescheduleDialog(false);
      await releaseLock();
      onOpenChange(false);
    } catch (error) {
      console.error('Error rescheduling series:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment) return;

    setLoading(true);
    try {
      if (isRecurringSeries && deleteType !== 'single') {
        await deleteAppointmentSeries.mutateAsync({
          recurring_group_id: appointment.recurring_group_id!,
          appointment_id: appointment.id,
          delete_type: deleteType,
          send_whatsapp: sendWhatsapp,
          client_phone: appointment.client?.phone,
          client_name: appointment.client?.name,
        });
      } else {
        await deleteAppointment.mutateAsync(appointment.id);
      }
      
      setShowDeleteDialog(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Erro ao excluir agendamento');
    } finally {
      setLoading(false);
    }
  };

  const handleEquipmentChange = (equipmentName: string) => {
    setSelectedEquipment(prev => 
      prev.includes(equipmentName)
        ? prev.filter(e => e !== equipmentName)
        : [...prev, equipmentName]
    );
  };

  const activeEquipment = equipment.filter(e => e.is_active);

  const originalStart = appointment ? parseISO(appointment.start_time) : new Date();
  const hasDateChanged = date !== format(originalStart, 'yyyy-MM-dd') || startTime !== format(originalStart, 'HH:mm');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 px-6 pt-6 text-center">
              Editar Agendamento
              {isRecurringSeries && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Repeat className="h-3 w-3" />
                  {seriesIndex} de {seriesCount}
                </Badge>
              )}
            </DialogTitle>
            {isRecurringSeries && (
              <DialogDescription className="px-6 text-center text-xs">
                Este agendamento faz parte de uma série recorrente
              </DialogDescription>
            )}
          </DialogHeader>
          
          <ScrollArea className="max-h-[72vh] px-6 pb-6">
          <div className="mx-auto max-w-xl space-y-4 py-4">
            {/* Client and Service Info (read-only) */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              {isLockedByOther && (
                <Badge variant="outline" className="mb-2 gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Em edição por {activeLock?.holder_name || activeLock?.user_email || 'outro usuário'}
                </Badge>
              )}
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{appointment?.client?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{appointment?.service?.name || appointment?.notes}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data</Label>
              <DateInputWithCalendar
                value={date}
                onChange={setDate}
                disabled={isLockedByOther}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário Início</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isLockedByOther}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário Fim</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isLockedByOther}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId} disabled={isLockedByOther}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem profissional</SelectItem>
                  {professionals
                    .filter((p) => p.is_active)
                    .map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sala</Label>
              <Select value={roomId} onValueChange={setRoomId} disabled={isLockedByOther}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma sala" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem sala</SelectItem>
                  {rooms
                    .filter((r) => r.is_active)
                    .map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Equipment Selection */}
            {activeEquipment.length > 0 && (
              <div className="space-y-2">
                <Label>Equipamentos</Label>
                <div className="flex flex-wrap gap-2">
                  {activeEquipment.map((equip) => (
                    <Button
                      key={equip.id}
                      type="button"
                      variant={selectedEquipment.includes(equip.name) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleEquipmentChange(equip.name)}
                    >
                      {equip.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={loading || isLockedByOther}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
              <div className="hidden flex-1 sm:block" />
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {isSeriesLike && hasDateChanged ? (
                <Button onClick={() => setShowRescheduleDialog(true)} disabled={loading || isLockedByOther}>
                  Salvar
                </Button>
              ) : (
                <Button onClick={handleSingleSubmit} disabled={loading || isLockedByOther}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Reschedule Options Dialog */}
      <AlertDialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              {isPackageAppointment ? 'Reagendar Pacote' : 'Reagendar Série'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPackageAppointment
                ? 'Este agendamento faz parte de um pacote. Como deseja reagendar?'
                : 'Este agendamento faz parte de uma série recorrente. Como deseja reagendar?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <RadioGroup 
              value={rescheduleFollowing ? 'following' : 'single'} 
              onValueChange={(v) => setRescheduleFollowing(v === 'following')}
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="single" id="single" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="single" className="font-medium cursor-pointer">
                    Apenas este agendamento
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Os outros agendamentos da série não serão alterados
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="following" id="following" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="following" className="font-medium cursor-pointer">
                    Este e todos os seguintes
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    O intervalo entre os agendamentos será mantido.{isRecurringSeries ? ` ${seriesCount - seriesIndex + 1} agendamento(s) serão alterados.` : ''}
                  </p>
                </div>
              </div>
            </RadioGroup>

            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Notificar cliente por WhatsApp</span>
              </div>
              <Switch
                checked={sendWhatsapp}
                onCheckedChange={setSendWhatsapp}
              />
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSeriesSubmit} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir Agendamento
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurringSeries 
                ? 'Este agendamento faz parte de uma série recorrente. Como deseja excluir?'
                : 'Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {isRecurringSeries && (
            <div className="space-y-4 py-4">
              <RadioGroup 
                value={deleteType} 
                onValueChange={(v) => setDeleteType(v as 'single' | 'following' | 'all')}
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="single" id="del-single" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="del-single" className="font-medium cursor-pointer">
                      Apenas este agendamento
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Os outros agendamentos da série serão mantidos
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="following" id="del-following" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="del-following" className="font-medium cursor-pointer">
                      Este e todos os seguintes
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {seriesCount - seriesIndex + 1} agendamento(s) serão excluídos
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="all" id="del-all" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="del-all" className="font-medium cursor-pointer text-destructive">
                      Toda a série
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Todos os {seriesCount} agendamentos da série serão excluídos
                    </p>
                  </div>
                </div>
              </RadioGroup>

              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Notificar cliente por WhatsApp</span>
                </div>
                <Switch
                  checked={sendWhatsapp}
                  onCheckedChange={setSendWhatsapp}
                />
              </div>
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loading}
            >
              {loading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
