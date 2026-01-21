import { useState, useEffect } from 'react';
import { format, addDays, addWeeks, addMonths, isBefore, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserX, Calendar, Clock, FileText, Trash2, Edit, CheckCircle, XCircle, History, Repeat, CalendarDays } from 'lucide-react';
import { Professional } from '@/types';
import { useProfessionalAbsences, ProfessionalAbsence } from '@/hooks/useProfessionalAbsences';
import { toast } from 'sonner';

interface ProfessionalAbsenceDialogProps {
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledDate?: Date;
  editingAbsence?: ProfessionalAbsence | null;
}

const ABSENCE_REASONS = [
  'Férias',
  'Atestado Médico',
  'Licença',
  'Feriado',
  'Treinamento',
  'Folga',
  'Compromisso Pessoal',
  'Reunião',
  'Outro',
];

const ABSENCE_STATUS = [
  { value: 'pending', label: 'Pendente', icon: Clock, className: 'bg-warning/10 text-warning' },
  { value: 'completed', label: 'Concluído', icon: CheckCircle, className: 'bg-success/10 text-success' },
  { value: 'missed', label: 'Faltou', icon: XCircle, className: 'bg-destructive/10 text-destructive' },
  { value: 'rescheduled', label: 'Reagendado', icon: History, className: 'bg-primary/10 text-primary' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'biweekly', label: 'Quinzenalmente' },
  { value: 'monthly', label: 'Mensalmente' },
];

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export function ProfessionalAbsenceDialog({
  professionals,
  open,
  onOpenChange,
  prefilledDate,
  editingAbsence,
}: ProfessionalAbsenceDialogProps) {
  const { absences, createAbsence, updateAbsence, deleteAbsence } = useProfessionalAbsences();
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'single' | 'following' | 'all'>('single');
  
  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');

  const isEditing = !!editingAbsence;

  useEffect(() => {
    if (editingAbsence) {
      setProfessionalId(editingAbsence.professional_id);
      const startDate = new Date(editingAbsence.start_time);
      setDate(format(startDate, 'yyyy-MM-dd'));
      setStartTime(format(startDate, 'HH:mm'));
      setEndTime(format(new Date(editingAbsence.end_time), 'HH:mm'));
      setReason(editingAbsence.reason || '');
      setNotes(editingAbsence.notes || '');
      // Extract status from notes or default to pending
      const statusMatch = editingAbsence.notes?.match(/\[STATUS:(.*?)\]/);
      setStatus(statusMatch ? statusMatch[1] : 'pending');
      // Reset recurrence for editing (we don't edit recurring ones as a group)
      setIsRecurring(false);
      setFrequency('weekly');
      setSelectedWeekdays([]);
      setRepeatUntil('');
    } else if (prefilledDate) {
      setDate(format(prefilledDate, 'yyyy-MM-dd'));
      // Set default weekday based on selected date
      setSelectedWeekdays([prefilledDate.getDay()]);
    } else {
      resetForm();
    }
  }, [editingAbsence, prefilledDate, open]);

  const activeProfessionals = professionals.filter(p => p.is_active);

  // Generate dates based on recurrence settings
  const generateRecurringDates = (): Date[] => {
    if (!isRecurring || !repeatUntil) return [new Date(date)];

    const dates: Date[] = [];
    const startDate = new Date(date);
    const endDate = new Date(repeatUntil);

    let currentDate = new Date(startDate);

    while (isBefore(currentDate, endDate) || isEqual(currentDate, endDate)) {
      if (frequency === 'daily') {
        dates.push(new Date(currentDate));
        currentDate = addDays(currentDate, 1);
      } else if (frequency === 'weekly') {
        // For weekly, check if the current day is in selectedWeekdays
        if (selectedWeekdays.length === 0 || selectedWeekdays.includes(currentDate.getDay())) {
          dates.push(new Date(currentDate));
        }
        currentDate = addDays(currentDate, 1);
      } else if (frequency === 'biweekly') {
        if (selectedWeekdays.length === 0 || selectedWeekdays.includes(currentDate.getDay())) {
          dates.push(new Date(currentDate));
        }
        // Move to next occurrence (every 2 weeks for the same weekday)
        if (dates.length > 0 && selectedWeekdays.includes(currentDate.getDay())) {
          currentDate = addWeeks(currentDate, 2);
        } else {
          currentDate = addDays(currentDate, 1);
        }
      } else if (frequency === 'monthly') {
        dates.push(new Date(currentDate));
        currentDate = addMonths(currentDate, 1);
      }

      // Safety limit to prevent infinite loops
      if (dates.length > 365) break;
    }

    return dates;
  };

  const handleSubmit = async () => {
    if (!professionalId) return;

    const notesWithStatus = notes ? `${notes} [STATUS:${status}]` : `[STATUS:${status}]`;

    if (isEditing && editingAbsence) {
      const startDateTime = new Date(`${date}T${startTime}`);
      const endDateTime = new Date(`${date}T${endTime}`);
      
      updateAbsence.mutate({
        id: editingAbsence.id,
        updates: {
          professional_id: professionalId,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          reason: reason || null,
          notes: notesWithStatus,
        },
      }, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    } else {
      // Handle recurring absences
      const datesToCreate = generateRecurringDates();
      
      if (datesToCreate.length === 0) {
        toast.error('Selecione pelo menos uma data ou configure a recorrência corretamente.');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const absenceDate of datesToCreate) {
        const dateStr = format(absenceDate, 'yyyy-MM-dd');
        const startDateTime = new Date(`${dateStr}T${startTime}`);
        const endDateTime = new Date(`${dateStr}T${endTime}`);

        try {
          await createAbsence.mutateAsync({
            professional_id: professionalId,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            reason: reason || null,
            notes: notesWithStatus,
          });
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} ausência(s) registrada(s) com sucesso!`);
        onOpenChange(false);
        resetForm();
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} ausência(s) não puderam ser registradas.`);
      }
    }
  };

  const handleDelete = async () => {
    if (editingAbsence) {
      if (deleteType === 'single') {
        // Delete only this absence
        deleteAbsence.mutate(editingAbsence.id, {
          onSuccess: () => {
            setShowDeleteConfirm(false);
            onOpenChange(false);
            resetForm();
          },
        });
      } else {
        // Delete absences with same pattern
        const currentAbsenceDate = new Date(editingAbsence.start_time);
        const absencesToDelete = absences.filter(a => {
          if (a.professional_id !== editingAbsence.professional_id) return false;
          if (a.reason !== editingAbsence.reason) return false;
          const absenceDate = new Date(a.start_time);
          if (deleteType === 'following') {
            return absenceDate >= currentAbsenceDate;
          }
          return true; // 'all' - delete all with same reason and professional
        });
        
        let successCount = 0;
        for (const absence of absencesToDelete) {
          try {
            await deleteAbsence.mutateAsync(absence.id);
            successCount++;
          } catch (error) {
            console.error('Error deleting absence:', error);
          }
        }
        
        if (successCount > 0) {
          toast.success(`${successCount} ausência(s) excluída(s) com sucesso!`);
        }
        setShowDeleteConfirm(false);
        onOpenChange(false);
        resetForm();
      }
    }
  };

  const resetForm = () => {
    setProfessionalId('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('08:00');
    setEndTime('18:00');
    setReason('');
    setNotes('');
    setStatus('pending');
    setIsRecurring(false);
    setFrequency('weekly');
    setSelectedWeekdays([]);
    setRepeatUntil('');
  };

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const isPending = createAbsence.isPending || updateAbsence.isPending || deleteAbsence.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              {isEditing ? <Edit className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
              {isEditing ? 'Editar Ausência' : 'Registrar Ausência de Profissional'}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Profissional *</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProfessionals.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex items-center gap-2">
                          {prof.agenda_color && (
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: prof.agenda_color }}
                            />
                          )}
                          {prof.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Início
                  </Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Término
                  </Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Recurrence Section - Only show when not editing */}
              {!isEditing && (
                <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Repeat className="h-4 w-4" />
                      Repetir Ausência
                    </Label>
                    <Switch
                      checked={isRecurring}
                      onCheckedChange={setIsRecurring}
                    />
                  </div>

                  {isRecurring && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Frequência</Label>
                        <Select value={frequency} onValueChange={setFrequency}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(frequency === 'weekly' || frequency === 'biweekly') && (
                        <div className="space-y-2">
                          <Label>Dias da Semana</Label>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAYS.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                variant={selectedWeekdays.includes(day.value) ? "default" : "outline"}
                                size="sm"
                                className="w-10 h-10"
                                onClick={() => toggleWeekday(day.value)}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Selecione os dias em que a ausência se repete
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          Repetir Até
                        </Label>
                        <Input
                          type="date"
                          value={repeatUntil}
                          onChange={(e) => setRepeatUntil(e.target.value)}
                          min={date}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Data limite para repetição da ausência
                        </p>
                      </div>

                      {isRecurring && repeatUntil && (
                        <div className="p-2 rounded bg-primary/10 text-sm">
                          <span className="font-medium">Prévia: </span>
                          {generateRecurringDates().length} ausência(s) serão criadas
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Campo de texto para detalhar o motivo */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Observações
                </Label>
                <Textarea
                  value={notes.replace(/\s*\[STATUS:.*?\]/, '')}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Descreva os detalhes do motivo da ausência, como justificativas, observações importantes, se há necessidade de reposição, contato de emergência, etc..."
                  className="min-h-[120px] resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Use este campo como lembrete ou para registrar informações importantes sobre a ausência.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <s.icon className="h-4 w-4" />
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 px-6 py-4 border-t shrink-0">
            {isEditing && (
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!professionalId || isPending}>
              {isPending ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Registrar Ausência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Excluir Ausência
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ausência? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <RadioGroup 
              value={deleteType} 
              onValueChange={(v) => setDeleteType(v as 'single' | 'following' | 'all')}
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="single" id="del-single" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="del-single" className="font-medium cursor-pointer">
                    Apenas esta ausência
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    As outras ausências deste profissional serão mantidas
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="following" id="del-following" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="del-following" className="font-medium cursor-pointer">
                    Esta e todas as seguintes com mesmo motivo
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Remove esta ausência e todas as futuras do mesmo profissional com o mesmo motivo
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="all" id="del-all" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="del-all" className="font-medium cursor-pointer text-destructive">
                    Todas as ausências com mesmo motivo
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Remove todas as ausências do profissional com o mesmo motivo (passadas e futuras)
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
          
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