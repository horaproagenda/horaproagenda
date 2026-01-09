import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserX, Calendar, Clock, FileText, Trash2, Edit, CheckCircle, XCircle, History } from 'lucide-react';
import { Professional } from '@/types';
import { useProfessionalAbsences, ProfessionalAbsence } from '@/hooks/useProfessionalAbsences';

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
  'Outro',
];

const ABSENCE_STATUS = [
  { value: 'pending', label: 'Pendente', icon: Clock, className: 'bg-warning/10 text-warning' },
  { value: 'completed', label: 'Concluído', icon: CheckCircle, className: 'bg-success/10 text-success' },
  { value: 'missed', label: 'Faltou', icon: XCircle, className: 'bg-destructive/10 text-destructive' },
  { value: 'rescheduled', label: 'Reagendado', icon: History, className: 'bg-primary/10 text-primary' },
];

export function ProfessionalAbsenceDialog({
  professionals,
  open,
  onOpenChange,
  prefilledDate,
  editingAbsence,
}: ProfessionalAbsenceDialogProps) {
  const { createAbsence, updateAbsence, deleteAbsence } = useProfessionalAbsences();
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    } else if (prefilledDate) {
      setDate(format(prefilledDate, 'yyyy-MM-dd'));
    } else {
      resetForm();
    }
  }, [editingAbsence, prefilledDate, open]);

  const activeProfessionals = professionals.filter(p => p.is_active);

  const handleSubmit = () => {
    if (!professionalId) return;

    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);
    
    // Include status in notes
    const notesWithStatus = notes ? `${notes} [STATUS:${status}]` : `[STATUS:${status}]`;

    const absenceData = {
      professional_id: professionalId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      reason: reason || null,
      notes: notesWithStatus,
    };

    if (isEditing && editingAbsence) {
      updateAbsence.mutate({
        id: editingAbsence.id,
        updates: absenceData,
      }, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    } else {
      createAbsence.mutate(absenceData, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    }
  };

  const handleDelete = () => {
    if (editingAbsence) {
      deleteAbsence.mutate(editingAbsence.id, {
        onSuccess: () => {
          setShowDeleteConfirm(false);
          onOpenChange(false);
          resetForm();
        },
      });
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
  };

  const isPending = createAbsence.isPending || updateAbsence.isPending || deleteAbsence.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {isEditing ? <Edit className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
              {isEditing ? 'Editar Ausência' : 'Registrar Ausência de Profissional'}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-4">
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
                  Detalhes do Motivo
                </Label>
                <ScrollArea className="h-24 w-full rounded-md border">
                  <Textarea
                    value={notes.replace(/\s*\[STATUS:.*?\]/, '')}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Descreva os detalhes do motivo da ausência, como justificativas, observações importantes, se há necessidade de reposição, contato de emergência, etc..."
                    className="min-h-[80px] resize-none border-0 focus-visible:ring-0"
                  />
                </ScrollArea>
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

          <DialogFooter className="flex gap-2 pt-4 border-t">
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
            <AlertDialogTitle>Excluir Ausência</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ausência? Esta ação não pode ser desfeita.
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