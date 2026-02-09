import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Appointment } from '@/types';
import { useRooms } from '@/hooks/useRooms';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useEquipment } from '@/hooks/useEquipment';
import { useAppointments } from '@/hooks/useAppointments';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

interface EditAppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAppointmentDialog({ appointment, open, onOpenChange }: EditAppointmentDialogProps) {
  const { rooms } = useRooms();
  const { professionals } = useProfessionals();
  const { equipment } = useEquipment();
  const { updateAppointment, deleteAppointment } = useAppointments();
  const { propagateSeriesDates } = useRecurringAppointments();

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [professionalId, setProfessionalId] = useState<string>('none');
  const [roomId, setRoomId] = useState<string>('none');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [propagateDates, setPropagateDates] = useState(false);

  // Store original duration when appointment is loaded
  const [originalDuration, setOriginalDuration] = useState<number>(0);

  const isRecurringOrPackage = !!(appointment?.recurring_group_id || appointment?.package_appointment);

  useEffect(() => {
    if (appointment) {
      const start = parseISO(appointment.start_time);
      const end = parseISO(appointment.end_time);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      setOriginalDuration(durationMinutes);
      setDate(format(start, 'yyyy-MM-dd'));
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(end, 'HH:mm'));
      setProfessionalId(appointment.professional_id || 'none');
      setRoomId(appointment.room_id || 'none');
      const room = rooms.find(r => r.id === appointment.room_id);
      setSelectedEquipment(room?.equipment || []);
      setPropagateDates(false);
    }
  }, [appointment, rooms]);

  // Auto-update end time when start time changes (maintaining duration)
  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    
    if (originalDuration > 0 && date && newStartTime) {
      try {
        const newStart = new Date(`${date}T${newStartTime}`);
        const newEnd = new Date(newStart.getTime() + originalDuration * 60000);
        setEndTime(format(newEnd, 'HH:mm'));
      } catch (e) {
        // Keep existing end time if calculation fails
      }
    }
  };

  const handleSubmit = async () => {
    if (!appointment) return;

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
      });

      // Propagate dates to following appointments if checked
      if (propagateDates && isRecurringOrPackage) {
        const newStartTime = new Date(`${date}T${startTime}`);
        const newEndTime = new Date(`${date}T${endTime}`);
        
        if (appointment.recurring_group_id) {
          await propagateSeriesDates.mutateAsync({
            appointment_id: appointment.id,
            new_start_time: newStartTime,
            new_end_time: newEndTime,
            propagate_type: 'recurring',
            recurring_group_id: appointment.recurring_group_id,
          });
        } else if (appointment.package_appointment?.package_id) {
          await propagateSeriesDates.mutateAsync({
            appointment_id: appointment.id,
            new_start_time: newStartTime,
            new_end_time: newEndTime,
            propagate_type: 'package',
            package_id: appointment.package_appointment.package_id,
          });
        }
        
        toast.success('Datas dos próximos agendamentos ajustadas!');
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error updating appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment) return;

    setLoading(true);
    try {
      await deleteAppointment.mutateAsync(appointment.id);
      toast.success('Agendamento excluído com sucesso!');
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário Início</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário Fim</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
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
              <Select value={roomId} onValueChange={setRoomId}>
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

            {/* Propagate dates option for recurring/package appointments */}
            {isRecurringOrPackage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Checkbox
                  id="propagate-dates-edit"
                  checked={propagateDates}
                  onCheckedChange={(checked) => setPropagateDates(!!checked)}
                />
                <label htmlFor="propagate-dates-edit" className="text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                  Ajustar datas dos próximos agendamentos automaticamente
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
