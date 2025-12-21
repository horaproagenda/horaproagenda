import { Appointment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar } from 'lucide-react';
import { getCategoryColor } from '@/lib/categoryColors';

interface ClientAppointmentsTabProps {
  appointments: Appointment[];
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Agendado', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  completed: { label: 'Realizado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  missed: { label: 'Faltou', variant: 'destructive' },
  rescheduled: { label: 'Reagendado', variant: 'secondary' },
};

export function ClientAppointmentsTab({ appointments }: ClientAppointmentsTabProps) {
  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Nenhum agendamento encontrado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Histórico de Agendamentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {appointments.map((appointment) => {
          const status = statusConfig[appointment.status] || statusConfig.scheduled;
          const categoryColor = getCategoryColor(appointment.service?.category || '');

          return (
            <div
              key={appointment.id}
              className={`p-4 rounded-lg border-l-4 bg-card hover:bg-muted/50 transition-colors ${categoryColor.border}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground">
                      {appointment.service?.name || appointment.package_appointment?.package?.name || 'Serviço'}
                    </h4>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {appointment.package_appointment && (
                      <Badge variant="outline" className="text-xs">Pacote</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(appointment.start_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(appointment.start_time), 'HH:mm')} -{' '}
                      {format(new Date(appointment.end_time), 'HH:mm')}
                    </div>
                  </div>

                  {appointment.notes && (
                    <p className="mt-2 text-sm text-muted-foreground italic">
                      {appointment.notes}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-semibold text-primary">
                    R$ {(appointment.service?.price || appointment.package_appointment?.package?.total_price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {appointment.service?.duration || appointment.package_appointment?.package?.duration || 0} min
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
