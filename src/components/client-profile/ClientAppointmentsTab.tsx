import { useMemo } from 'react';
import { Appointment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar, Package, Sparkles } from 'lucide-react';

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

// Generate unique colors for packages/services
const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#f59e0b', // amber
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#6366f1', // indigo
    '#f97316', // orange
  ];
  return colors[Math.abs(hash) % colors.length];
};

export function ClientAppointmentsTab({ appointments }: ClientAppointmentsTabProps) {
  // Group appointments by package/service for color coding
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach(apt => {
      const key = apt.package_appointment?.package?.id || apt.service?.id || '';
      if (key && !map.has(key)) {
        const name = apt.package_appointment?.package?.name || apt.service?.name || '';
        map.set(key, generateColor(name));
      }
    });
    return map;
  }, [appointments]);

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

  // Sort by date descending to show most recent first
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Histórico de Agendamentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedAppointments.map((appointment) => {
          const status = statusConfig[appointment.status] || statusConfig.scheduled;
          const isPackage = !!appointment.package_appointment;
          const packageId = appointment.package_appointment?.package?.id;
          const serviceId = appointment.service?.id;
          const colorKey = packageId || serviceId || '';
          const borderColor = colorMap.get(colorKey) || '#999';

          return (
            <div
              key={appointment.id}
              className="p-3 rounded-lg bg-card hover:bg-muted/50 transition-colors border-l-4"
              style={{ borderLeftColor: borderColor }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {isPackage ? (
                      <Package className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                    <h4 className="font-medium text-foreground truncate">
                      {appointment.service?.name || appointment.package_appointment?.package?.name || 'Serviço'}
                    </h4>
                    <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                    {isPackage && (
                      <Badge variant="outline" className="text-xs bg-primary/5">
                        Sessão {appointment.package_appointment?.session_number}/{appointment.package_appointment?.package?.total_sessions}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(appointment.start_time), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(appointment.start_time), 'HH:mm')} -{' '}
                      {format(new Date(appointment.end_time), 'HH:mm')}
                    </div>
                  </div>

                  {appointment.notes && (
                    <p className="mt-1 text-xs text-muted-foreground italic truncate">
                      {appointment.notes}
                    </p>
                  )}
                </div>

                <div className="text-right text-sm">
                  <p className="font-semibold text-primary">
                    R$ {(appointment.service?.price || 0).toFixed(2)}
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
