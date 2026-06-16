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

  const handleSubmit = async () => {
    if (!appointment) return;

    // Block save if there are conflicts and user wants to propagate
    if (propagateDates && previewSessions && previewConflicts.length > 0) {
      toast.error(`Existem ${previewConflicts.length} conflito(s). Ajuste o horário ou desmarque a propagação.`);
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
          // O banco já cascateou via trigger ao salvar o source. Aqui só
          // refrescamos cache e damos feedback.
          await propagateSeriesDates.mutateAsync({
            appointment_id: appointment.id,
            new_start_time: newStartTime,
            new_end_time: newEndTime,
            propagate_type: 'package',
            package_id: appointment.package_appointment.package_id,
          });
        }
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
              <div className="space-y-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="propagate-dates-edit"
                    checked={propagateDates}
                    onCheckedChange={(checked) => { setPropagateDates(!!checked); setPreviewSessions(null); }}
                  />
                  <label htmlFor="propagate-dates-edit" className="text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                    Alterar datas/horários das próximas aplicações
                  </label>
                </div>

                {propagateDates && isPackage && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handlePreview}
                      disabled={previewLoading || !date || !startTime}
                    >
                      {previewLoading ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Calculando…</>
                      ) : (
                        <><Eye className="h-3 w-3 mr-1" /> Pré-visualizar próximas aplicações</>
                      )}
                    </Button>

                    {previewSessions && previewSessions.length > 0 && (
                      <div className="space-y-1 mt-2 max-h-40 overflow-y-auto rounded border bg-background/60 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">
                          {previewSessions.filter(s => !s.is_source).length} sessão(ões) seguinte(s)
                        </div>
                        {previewSessions.filter(s => !s.is_source).map((s) => (
                          <div
                            key={s.package_appointment_id}
                            className={`flex items-start gap-2 text-[11px] py-1 px-2 rounded ${
                              s.conflict
                                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                                : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                            }`}
                          >
                            {s.conflict ? (
                              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium tabular-nums">
                                #{s.session_number || '-'} · {formatPreviewDate(s.new_start)}
                                {!s.is_mutable && <span className="text-muted-foreground"> (já realizada)</span>}
                              </div>
                              {s.conflict && s.conflict_with && (
                                <div className="text-[10px] truncate">⚠ Conflito com: {s.conflict_with}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {previewSessions && previewConflicts.length > 0 && (
                      <div className="flex items-start gap-2 p-2 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[11px]">
                        <AlertTriangle className="h-3 w-3 mt-0.5" />
                        <span>
                          {previewConflicts.length} conflito(s). Altere o horário ou cancele/reagende
                          o agendamento conflitante antes de salvar.
                        </span>
                      </div>
                    )}

                    {previewSessions && previewSessions.filter(s => !s.is_source).length === 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Não há aplicações seguintes editáveis neste pacote.
                      </div>
                    )}
                  </>
                )}
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
              <Button
                onClick={handleSubmit}
                disabled={loading || (propagateDates && isPackage && previewConflicts.length > 0)}
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
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
