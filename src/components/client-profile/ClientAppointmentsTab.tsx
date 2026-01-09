import { useMemo, useState } from 'react';
import { Appointment } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar, Package, Sparkles, Filter } from 'lucide-react';

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

const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  return colors[Math.abs(hash) % colors.length];
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

export function ClientAppointmentsTab({ appointments }: ClientAppointmentsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const filteredAppointments = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    
    return appointments
      .filter(a => {
        try {
          const date = parseISO(a.start_time);
          return isWithinInterval(date, { start: monthStart, end: monthEnd });
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [appointments, selectedMonth]);

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

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredAppointments.length} agendamento(s)
        </span>
      </div>

      {/* Appointments List */}
      <Card>
        <CardContent className="p-3">
          {filteredAppointments.length === 0 ? (
            <div className="py-6 text-center">
              <Calendar className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum agendamento neste mês</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {filteredAppointments.map((appointment) => {
                const status = statusConfig[appointment.status] || statusConfig.scheduled;
                const isPackage = !!appointment.package_appointment;
                const colorKey = appointment.package_appointment?.package?.id || appointment.service?.id || '';
                const borderColor = colorMap.get(colorKey) || '#999';

                return (
                  <div
                    key={appointment.id}
                    className="p-2.5 rounded-lg bg-card hover:bg-muted/30 transition-colors border-l-3"
                    style={{ borderLeftColor: borderColor, borderLeftWidth: '3px' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isPackage ? (
                          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">
                          {appointment.service?.name || appointment.package_appointment?.package?.name || 'Serviço'}
                        </span>
                        <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                          {status.label}
                        </Badge>
                        {isPackage && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/5 shrink-0">
                            {appointment.package_appointment?.session_number}/{appointment.package_appointment?.package?.total_sessions}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-primary shrink-0">
                        R$ {(appointment.service?.price || 0).toFixed(0)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(appointment.start_time), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(appointment.start_time), 'HH:mm')} - {format(new Date(appointment.end_time), 'HH:mm')}
                      </div>
                    </div>

                    {appointment.notes && (
                      <p className="mt-1 text-[10px] text-muted-foreground italic truncate">
                        {appointment.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}