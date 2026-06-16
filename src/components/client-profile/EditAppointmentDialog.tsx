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
import { Trash2, Eye, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { DateInputWithCalendar } from '@/components/ui/date-input-with-calendar';
import { supabase } from '@/integrations/supabase/client';

interface EditAppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PreviewSession {
  package_appointment_id: string;
  appointment_id: string | null;
  session_number: number | null;
  is_source: boolean;
  current_start: string | null;
  new_start: string;
  new_end: string;
  is_mutable: boolean;
  conflict: boolean;
  conflict_with: string | null;
}

interface PreviewConflict {
  date: string;
  time: string;
  session_number: number | null;
  with: string;
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
  const [showPropagateConfirm, setShowPropagateConfirm] = useState(false);


  const [originalDuration, setOriginalDuration] = useState<number>(0);

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSessions, setPreviewSessions] = useState<PreviewSession[] | null>(null);
  const [previewConflicts, setPreviewConflicts] = useState<PreviewConflict[]>([]);

  const isPackage = !!appointment?.package_appointment;
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
      setPropagateDates(!!appointment.package_appointment);
      setPreviewSessions(null);
      setPreviewConflicts([]);
    }
  }, [appointment, rooms]);

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    if (originalDuration > 0 && date && newStartTime) {
      try {
        const newStart = new Date(`${date}T${newStartTime}`);
        const newEnd = new Date(newStart.getTime() + originalDuration * 60000);
        setEndTime(format(newEnd, 'HH:mm'));
      } catch (e) {}
    }
    setPreviewSessions(null);
  };

  const handlePreview = async () => {
    if (!appointment || !date || !startTime) {
      toast.error('Preencha data e horário antes de pré-visualizar');
      return;
    }
    setPreviewLoading(true);
    try {
      const newStartIso = new Date(`${date}T${startTime}`).toISOString();
      const { data, error } = await supabase.rpc('preview_package_appointment_cascade', {
        _appointment_id: appointment.id,
        _new_start: newStartIso,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || 'Falha ao pré-visualizar');
        return;
      }
      setPreviewSessions(result.sessions || []);
      setPreviewConflicts(result.conflicts || []);
      if ((result.conflicts || []).length > 0) {
        toast.warning(`${result.conflicts.length} conflito(s) detectado(s). Revise antes de salvar.`);
      } else {
        toast.success('Sem conflitos detectados nas próximas aplicações.');
      }
    } catch (e: any) {
      toast.error('Erro ao pré-visualizar: ' + (e.message || ''));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Auto-shift following package sessions away from conflicts (next available day, same time)
  const autoResolveConflicts = async (packageId: string) => {
    try {
      const { data: paList } = await supabase
        .from('package_appointments')
        .select('id, appointment_id, session_number, appointment:appointments!package_appointments_appointment_id_fkey(id, start_time, end_time, status)')
        .eq('package_id', packageId)
        .order('sequence_order', { ascending: true })
        .order('session_number', { ascending: true });

      let shifted = 0;
      for (const pa of paList || []) {
        const apt: any = (pa as any).appointment;
        if (!apt || ['completed', 'missed', 'cancelled'].includes(apt.status)) continue;
        if (apt.id === appointment!.id) continue;

        // Check conflict using preview RPC: try shifting by +1 day until free (max 14 attempts)
        let attempts = 0;
        let curStart = new Date(apt.start_time);
        let curEnd = new Date(apt.end_time);

        while (attempts < 14) {
          const { data: conflictsData } = await (supabase as any).rpc('check_appointment_conflict', {
            _appointment_id: apt.id,
            _start_time: curStart.toISOString(),
            _end_time: curEnd.toISOString(),
          }).maybeSingle?.() ?? { data: null };

          // Fallback: just query appointments overlapping (excluding self)
          const { data: overlap } = await supabase
            .from('appointments')
            .select('id')
            .neq('id', apt.id)
            .eq('professional_id', appointment!.professional_id)
            .not('status', 'in', '(cancelled,missed,rescheduled)')
            .lt('start_time', curEnd.toISOString())
            .gt('end_time', curStart.toISOString())
            .limit(1);

          if (!overlap || overlap.length === 0) break;

          // Shift +1 day
          curStart = new Date(curStart.getTime() + 24 * 60 * 60 * 1000);
          curEnd = new Date(curEnd.getTime() + 24 * 60 * 60 * 1000);
          attempts++;
        }

        if (attempts > 0 && attempts < 14) {
          await supabase
            .from('appointments')
            .update({ start_time: curStart.toISOString(), end_time: curEnd.toISOString() })
            .eq('id', apt.id);
          shifted++;
          toast.warning(`Sessão #${pa.session_number}: choque detectado, reagendada para ${format(curStart, "dd/MM/yyyy 'às' HH:mm")}.`);
        }
      }
      if (shifted > 0) {
        toast.success(`${shifted} sessão(ões) reagendadas automaticamente para o próximo dia livre.`);
      }
    } catch (e) {
      console.warn('[autoResolveConflicts] failed:', e);
    }
  };

  const performSave = async (propagate: boolean) => {
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

      if (propagate && isRecurringOrPackage) {
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
          // After cascade by trigger, auto-resolve any remaining conflicts
          await autoResolveConflicts(appointment.package_appointment.package_id);
        }
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Erro ao salvar agendamento');
    } finally {
      setLoading(false);
      setShowPropagateConfirm(false);
    }
  };

  const handleSubmit = async () => {
    if (!appointment) return;
    // For recurring/package, ask for confirmation about adjusting following sessions
    if (isRecurringOrPackage) {
      setShowPropagateConfirm(true);
      return;
    }
    await performSave(false);
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

  const formatPreviewDate = (iso: string) =>
    format(new Date(iso), "dd/MM/yyyy 'às' HH:mm");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <DateInputWithCalendar
                value={date}
                onChange={(v) => { setDate(v); setPreviewSessions(null); }}
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
              <Select value={professionalId} onValueChange={(v) => { setProfessionalId(v); setPreviewSessions(null); }}>
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
              <Select value={roomId} onValueChange={(v) => { setRoomId(v); setPreviewSessions(null); }}>
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

            {isRecurringOrPackage && (
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300">
                Ao salvar, você poderá optar por ajustar as próximas aplicações desta série/pacote.
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

      {/* Confirmation: adjust following sessions */}
      <AlertDialog open={showPropagateConfirm} onOpenChange={setShowPropagateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajustar próximas aplicações?</AlertDialogTitle>
            <AlertDialogDescription>
              Este agendamento faz parte de {isPackage ? 'um pacote' : 'uma série recorrente'}.
              Deseja ajustar também as próximas aplicações respeitando o intervalo, horário escolhido,
              dias de atendimento e disponibilidade do profissional? Caso alguma data conflite com outro
              agendamento ou fora do expediente, ela será automaticamente reagendada para o próximo dia livre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => performSave(false)} disabled={loading}>
              Só este agendamento
            </Button>
            <AlertDialogAction onClick={() => performSave(true)} disabled={loading}>
              Sim, ajustar seguintes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

          </div>
        </DialogContent>
      </Dialog>

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
