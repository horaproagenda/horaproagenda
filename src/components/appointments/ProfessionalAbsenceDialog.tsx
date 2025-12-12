import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserX, Calendar, Clock, FileText } from 'lucide-react';
import { Professional } from '@/types';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';

interface ProfessionalAbsenceDialogProps {
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledDate?: Date;
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

export function ProfessionalAbsenceDialog({
  professionals,
  open,
  onOpenChange,
  prefilledDate,
}: ProfessionalAbsenceDialogProps) {
  const { createAbsence } = useProfessionalAbsences();
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(prefilledDate ? format(prefilledDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const activeProfessionals = professionals.filter(p => p.is_active);

  const handleSubmit = () => {
    if (!professionalId) return;

    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);

    createAbsence.mutate({
      professional_id: professionalId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      reason: reason || null,
      notes: notes || null,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setProfessionalId('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('08:00');
    setEndTime('18:00');
    setReason('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            Registrar Ausência de Profissional
          </DialogTitle>
        </DialogHeader>

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

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Detalhes (opcional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais sobre a ausência..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!professionalId || createAbsence.isPending}>
            {createAbsence.isPending ? 'Salvando...' : 'Registrar Ausência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
