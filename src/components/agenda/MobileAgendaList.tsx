import { useMemo } from 'react';
import { format, isSameDay, isSameMonth, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
} from 'lucide-react';
import { Appointment, Professional } from '@/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MobileViewType } from './MobileAgendaHeader';

interface MobileAgendaListProps {
  appointments: Appointment[];
  professionals: Professional[];
  selectedDate: Date;
  onAppointmentClick: (appointment: Appointment) => void;
  mobileView: MobileViewType;
  onDateSelect: (date: Date) => void;
}

const statusDot: Record<string, string> = {
  scheduled: 'bg-info',
  confirmed: 'bg-success',
  completed: 'bg-muted-foreground',
  cancelled: 'bg-destructive',
  missed: 'bg-destructive',
  rescheduled: 'bg-warning',
};

const paymentConfig = {
  pending: { icon: AlertCircle, className: 'text-warning' },
  partial: { icon: Clock, className: 'text-info' },
  paid: { icon: CheckCircle2, className: 'text-success' },
};

export function MobileAgendaList({ 
  appointments, 
  professionals,
  selectedDate,
  onAppointmentClick,
  mobileView,
  onDateSelect,
}: MobileAgendaListProps) {

  if (mobileView === 'month') {
    return <MobileMonthView selectedDate={selectedDate} appointments={appointments} professionals={professionals} onDateSelect={onDateSelect} />;
  }

  if (mobileView === 'week') {
    return <MobileWeekView selectedDate={selectedDate} appointments={appointments} professionals={professionals} onAppointmentClick={onAppointmentClick} onDateSelect={onDateSelect} />;
  }

  // Day view
  return <MobileDayView selectedDate={selectedDate} appointments={appointments} professionals={professionals} onAppointmentClick={onAppointmentClick} />;
}

// ─── Day View ───────────────────────────────────────────
function MobileDayView({ selectedDate, appointments, professionals, onAppointmentClick }: {
  selectedDate: Date;
  appointments: Appointment[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
}) {
  const dayAppointments = useMemo(() => {
    return appointments
      .filter(apt => isSameDay(new Date(apt.start_time), selectedDate))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [appointments, selectedDate]);

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
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Calendar className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-[12px] text-muted-foreground text-center">
          Nenhum agendamento para {format(selectedDate, "d 'de' MMM", { locale: ptBR })}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <div className="space-y-0.5 px-2 pb-4 pt-1">
        {Object.entries(groupedByHour).map(([hour, apts]) => (
          <div key={hour} className="space-y-0.5">
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-0.5 px-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {hour}
              </span>
            </div>
            {apts.map(apt => (
              <AppointmentRow key={apt.id} apt={apt} professionals={professionals} onClick={() => onAppointmentClick(apt)} />
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Week View ──────────────────────────────────────────
function MobileWeekView({ selectedDate, appointments, professionals, onAppointmentClick, onDateSelect }: {
  selectedDate: Date;
  appointments: Appointment[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
  onDateSelect: (date: Date) => void;
}) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <div className="px-2 pb-4 pt-1">
        {/* Day chips row */}
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          {weekDays.map(day => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = appointments.filter(a => isSameDay(new Date(a.start_time), day)).length;
            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  "flex flex-col items-center min-w-[40px] px-1.5 py-1 rounded-lg transition-colors flex-shrink-0",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted/40",
                  isToday && !isSelected && "ring-1 ring-primary/40"
                )}
              >
                <span className={cn("text-[9px] font-medium uppercase", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                </span>
                <span className={cn("text-[13px] font-bold leading-tight", isSelected ? "text-primary-foreground" : "text-foreground")}>
                  {format(day, 'd')}
                </span>
                {count > 0 && (
                  <span className={cn("text-[8px] font-semibold", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day appointments */}
        <DayAppointmentsList
          date={selectedDate}
          appointments={appointments}
          professionals={professionals}
          onAppointmentClick={onAppointmentClick}
        />
      </div>
    </ScrollArea>
  );
}

// ─── Month View ─────────────────────────────────────────
function MobileMonthView({ selectedDate, appointments, professionals, onDateSelect }: {
  selectedDate: Date;
  appointments: Appointment[];
  professionals: Professional[];
  onDateSelect: (date: Date) => void;
}) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start
  const firstDayOfMonth = getDay(monthStart);
  const padStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const prevDays = Array.from({ length: padStart }, (_, i) => addDays(monthStart, -(padStart - i)));

  // Pad end
  const lastDay = getDay(monthEnd);
  const padEnd = lastDay === 0 ? 0 : 7 - lastDay;
  const nextDays = Array.from({ length: padEnd }, (_, i) => addDays(monthEnd, i + 1));

  const allDays = [...prevDays, ...days, ...nextDays];

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <div className="px-2 pb-4 pt-1">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {allDays.map(day => {
            const isCurrentMonth = isSameMonth(day, selectedDate);
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = appointments.filter(a => isSameDay(new Date(a.start_time), day)).length;

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  "flex flex-col items-center justify-center py-1.5 rounded-md transition-colors min-h-[36px]",
                  isSelected ? "bg-primary text-primary-foreground" : "",
                  isToday && !isSelected && "ring-1 ring-primary/40",
                  !isCurrentMonth && "opacity-30"
                )}
              >
                <span className={cn(
                  "text-[12px] font-medium leading-tight",
                  isSelected ? "text-primary-foreground" : "text-foreground"
                )}>
                  {format(day, 'd')}
                </span>
                {count > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {count <= 3 ? (
                      Array.from({ length: count }).map((_, i) => (
                        <div key={i} className={cn("h-1 w-1 rounded-full", isSelected ? "bg-primary-foreground/70" : "bg-primary/60")} />
                      ))
                    ) : (
                      <span className={cn("text-[8px] font-bold", isSelected ? "text-primary-foreground/80" : "text-primary/70")}>
                        {count}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── Shared Components ──────────────────────────────────
function DayAppointmentsList({ date, appointments, professionals, onAppointmentClick }: {
  date: Date;
  appointments: Appointment[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
}) {
  const dayApts = useMemo(() => {
    return appointments
      .filter(a => isSameDay(new Date(a.start_time), date))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [appointments, date]);

  if (dayApts.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-[11px] text-muted-foreground">Sem agendamentos</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {dayApts.map(apt => (
        <AppointmentRow key={apt.id} apt={apt} professionals={professionals} onClick={() => onAppointmentClick(apt)} />
      ))}
    </div>
  );
}

function AppointmentRow({ apt, professionals, onClick }: {
  apt: Appointment;
  professionals: Professional[];
  onClick: () => void;
}) {
  const profId = apt.professional_id || apt.service?.professional_id;
  const prof = professionals.find(p => p.id === profId);
  const profColor = prof?.agenda_color || '#94a3b8';
  const timeStr = format(new Date(apt.start_time), 'HH:mm');
  const dot = statusDot[apt.status as string] || statusDot.scheduled;
  const payment = paymentConfig[apt.payment_status as keyof typeof paymentConfig] || paymentConfig.pending;
  const PaymentIcon = payment.icon;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-card border border-border/40 active:bg-muted/50 transition-colors"
      style={{ borderLeftColor: profColor, borderLeftWidth: '3px' }}
    >
      <div className="flex-shrink-0 w-10 text-center">
        <span className="text-[12px] font-bold text-foreground leading-tight">{timeStr}</span>
        <p className="text-[9px] text-muted-foreground">{apt.service?.duration || 30}min</p>
      </div>
      
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[12px] font-semibold text-foreground truncate leading-tight">
          {apt.client?.name || 'Cliente'}
        </p>
        <p className="text-[11px] text-muted-foreground truncate leading-tight">
          {apt.service?.name || 'Serviço'}
        </p>
        {prof && (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: profColor }} />
            <span className="text-[10px] text-muted-foreground truncate">{prof.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
      
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        <div className={cn('h-2 w-2 rounded-full', dot)} />
        <PaymentIcon className={cn('h-3.5 w-3.5', payment.className)} />
      </div>
    </div>
  );
}
