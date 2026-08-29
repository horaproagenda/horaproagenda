import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Appointment } from '@/types';
import { sharedResourceColor } from '@/lib/sharedResourceAgenda';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
}

/**
 * Resumo somente-leitura de um bloqueio de sala/equipamento compartilhado.
 * Mostra exclusivamente profissional, início e término — nenhum dado do
 * atendimento de outro profissional é exibido aqui.
 */
export function SharedResourceSummaryDialog({ open, onOpenChange, appointment }: Props) {
  if (!appointment) return null;
  const color = sharedResourceColor(appointment);
  const profName =
    (appointment as { shared_professional_name?: string | null }).shared_professional_name ||
    appointment.client?.name ||
    'Outro profissional';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Recurso ocupado</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="text-muted-foreground">Profissional:</span>
            <span className="font-medium truncate">{profName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Início:</span>
            <span className="font-medium tabular-nums">
              {format(new Date(appointment.start_time), 'dd/MM/yyyy HH:mm')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Término:</span>
            <span className="font-medium tabular-nums">
              {format(new Date(appointment.end_time), 'dd/MM/yyyy HH:mm')}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
