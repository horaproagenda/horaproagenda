import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign,
  Calendar,
  Phone,
} from 'lucide-react';
import { Appointment, Professional } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MobileAgendaListProps {
  appointments: Appointment[];
  professionals: Professional[];
  selectedDate: Date;
  onAppointmentClick: (appointment: Appointment) => void;
}

const statusConfig = {
  scheduled: { label: 'Ag', className: 'bg-info/10 text-info border-info/20', dot: 'bg-info' },
  confirmed: { label: 'Cf', className: 'bg-success/10 text-success border-success/20', dot: 'bg-success' },
  completed: { label: 'Ok', className: 'bg-muted text-muted-foreground border-muted', dot: 'bg-muted-foreground' },
  cancelled: { label: 'Cn', className: 'bg-destructive/10 text-destructive border-destructive/20', dot: 'bg-destructive' },
  missed: { label: 'Ft', className: 'bg-destructive/10 text-destructive border-destructive/20', dot: 'bg-destructive' },
  rescheduled: { label: 'Re', className: 'bg-warning/10 text-warning border-warning/20', dot: 'bg-warning' },
};

const paymentConfig = {
  pending: { icon: AlertCircle, className: 'text-warning', label: 'Pend' },
  partial: { icon: Clock, className: 'text-info', label: 'Parc' },
  paid: { icon: CheckCircle2, className: 'text-success', label: 'Pago' },
};

export function MobileAgendaList({ 
  appointments, 
  professionals,
  selectedDate,
  onAppointmentClick 
}: MobileAgendaListProps) {
  // Filter appointments for selected date and sort by time
  const dayAppointments = useMemo(() => {
    return appointments
      .filter(apt => isSameDay(new Date(apt.start_time), selectedDate))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [appointments, selectedDate]);

  // Group by time for visual separation
  const groupedByHour = useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    dayAppointments.forEach(apt => {
      const hour = format(new Date(apt.start_time), 'HH:00');
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(apt);
    });
    return groups;
  }, [dayAppointments]);

  if (dayAppointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground text-center">
          Nenhum agendamento para {format(selectedDate, "d 'de' MMM", { locale: ptBR })}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-1 px-1 pb-4">
        {Object.entries(groupedByHour).map(([hour, apts]) => (
          <div key={hour} className="space-y-0.5">
            {/* Hour separator */}
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-0.5 px-1">
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                {hour}
              </span>
            </div>
            
            {/* Appointments in this hour */}
            {apts.map(apt => {
              const status = statusConfig[apt.status as keyof typeof statusConfig] || statusConfig.scheduled;
              const payment = paymentConfig[apt.payment_status as keyof typeof paymentConfig || 'pending'];
              const PaymentIcon = payment.icon;
              
              const profId = apt.professional_id || apt.service?.professional_id;
              const prof = professionals.find(p => p.id === profId);
              const profColor = prof?.agenda_color || '#94a3b8';
              
              const timeStr = format(new Date(apt.start_time), 'HH:mm');
              
              return (
                <div
                  key={apt.id}
                  onClick={() => onAppointmentClick(apt)}
                  className="flex items-center gap-2 p-2 rounded-md bg-card border border-border/40 active:bg-muted/50 transition-colors"
                  style={{ borderLeftColor: profColor, borderLeftWidth: '3px' }}
                >
                  {/* Time column - compact */}
                  <div className="flex-shrink-0 w-10 text-center">
                    <span className="text-[11px] font-semibold text-foreground">{timeStr}</span>
                    <p className="text-[9px] text-muted-foreground">{apt.service?.duration || 30}m</p>
                  </div>
                  
                  {/* Main info - vertical stack */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Client name */}
                    <p className="text-[11px] font-medium text-foreground truncate leading-tight">
                      {apt.client?.name || 'Cliente'}
                    </p>
                    
                    {/* Service */}
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">
                      {apt.service?.name || 'Serviço'}
                    </p>
                    
                    {/* Professional - only if different context needed */}
                    {prof && (
                      <div className="flex items-center gap-1">
                        <div 
                          className="h-1.5 w-1.5 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: profColor }}
                        />
                        <span className="text-[9px] text-muted-foreground truncate">
                          {prof.name.split(' ')[0]}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Status indicators - compact vertical */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                    {/* Status badge */}
                    <div className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                    
                    {/* Payment indicator */}
                    <PaymentIcon className={cn('h-3 w-3', payment.className)} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
