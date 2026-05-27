import { useMemo } from 'react';
import { format, isSameDay, isSameMonth, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  UserX,
} from 'lucide-react';
import { Appointment, Professional } from '@/types';
import { ProfessionalAbsence } from '@/hooks/useProfessionalAbsences';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MobileViewType } from './MobileAgendaHeader';
import { getAppointmentStatusConfig } from '@/lib/appointmentStatus';
import { buildAppointmentPackageSequenceMap, getAppointmentPackageApplicationLabel } from '@/lib/packageSequence';

interface MobileAgendaListProps {
  appointments: Appointment[];
  professionals: Professional[];
  absences?: ProfessionalAbsence[];
  selectedDate: Date;
  onAppointmentClick: (appointment: Appointment) => void;
  onAbsenceClick?: (absence: ProfessionalAbsence) => void;
  mobileView: MobileViewType;
  onDateSelect: (date: Date) => void;
}

const paymentConfig = {
  pending: { icon: AlertCircle, className: 'text-warning' },
  partial: { icon: Clock, className: 'text-info' },
  paid: { icon: CheckCircle2, className: 'text-success' },
};

type TimelineItem =
  | { kind: 'appointment'; time: string; data: Appointment }
  | { kind: 'absence'; time: string; data: ProfessionalAbsence };

function getDayAbsences(absences: ProfessionalAbsence[], date: Date) {
  return absences.filter((a) => {
    const start = new Date(a.start_time);
    const end = new Date(a.end_time);
    // Overlaps the calendar day
    return start <= endOfDay(date) && end >= startOfDay(date);
  });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function buildTimeline(
  appointments: Appointment[],
  absences: ProfessionalAbsence[],
  date: Date,
): TimelineItem[] {
  const apts: TimelineItem[] = appointments
    .filter((a) => isSameDay(new Date(a.start_time), date))
    .map((a) => ({ kind: 'appointment' as const, time: a.start_time, data: a }));
  const abs: TimelineItem[] = getDayAbsences(absences, date).map((a) => ({
    kind: 'absence' as const,
    time: a.start_time,
    data: a,
  }));
  return [...apts, ...abs].sort((a, b) => a.time.localeCompare(b.time));
}

export function MobileAgendaList({
  appointments,
  professionals,
  absences = [],
  selectedDate,
  onAppointmentClick,
  onAbsenceClick,
  mobileView,
  onDateSelect,
}: MobileAgendaListProps) {
  const packageSequenceMap = useMemo(() => buildAppointmentPackageSequenceMap(appointments), [appointments]);

  if (mobileView === 'month') {
    return (
      <MobileMonthView
        selectedDate={selectedDate}
        appointments={appointments}
        absences={absences}
        professionals={professionals}
        onDateSelect={onDateSelect}
      />
    );
  }

  if (mobileView === 'week') {
    return (
      <MobileWeekView
        selectedDate={selectedDate}
        appointments={appointments}
        absences={absences}
        professionals={professionals}
        onAppointmentClick={onAppointmentClick}
        onAbsenceClick={onAbsenceClick}
        onDateSelect={onDateSelect}
        packageSequenceMap={packageSequenceMap}
      />
    );
  }

  return (
    <MobileDayView
      selectedDate={selectedDate}
      appointments={appointments}
      absences={absences}
      professionals={professionals}
      onAppointmentClick={onAppointmentClick}
      onAbsenceClick={onAbsenceClick}
      packageSequenceMap={packageSequenceMap}
    />
  );
}

// ─── Day View ───────────────────────────────────────────
function MobileDayView({ selectedDate, appointments, absences, professionals, onAppointmentClick, onAbsenceClick, packageSequenceMap }: {
  selectedDate: Date;
  appointments: Appointment[];
  absences: ProfessionalAbsence[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
  onAbsenceClick?: (a: ProfessionalAbsence) => void;
  packageSequenceMap: Map<string, number>;
}) {
  const timeline = useMemo(
    () => buildTimeline(appointments, absences, selectedDate),
    [appointments, absences, selectedDate],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    timeline.forEach((item) => {
      const hour = format(new Date(item.time), 'HH:00');
      (groups[hour] ||= []).push(item);
    });
    return groups;
  }, [timeline]);

  if (timeline.length === 0) {
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
        {Object.entries(grouped).map(([hour, items]) => (
          <div key={hour} className="space-y-0.5">
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-0.5 px-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {hour}
              </span>
            </div>
            {items.map((item) =>
              item.kind === 'appointment' ? (
                <AppointmentRow
                  key={`apt-${item.data.id}`}
                  apt={item.data}
                  professionals={professionals}
                  onClick={() => onAppointmentClick(item.data)}
                  packageSequenceMap={packageSequenceMap}
                />
              ) : (
                <AbsenceRow
                  key={`abs-${item.data.id}`}
                  absence={item.data}
                  professionals={professionals}
                  onClick={() => onAbsenceClick?.(item.data)}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Week View ──────────────────────────────────────────
function MobileWeekView({ selectedDate, appointments, absences, professionals, onAppointmentClick, onAbsenceClick, onDateSelect, packageSequenceMap }: {
  selectedDate: Date;
  appointments: Appointment[];
  absences: ProfessionalAbsence[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
  onAbsenceClick?: (a: ProfessionalAbsence) => void;
  onDateSelect: (date: Date) => void;
  packageSequenceMap: Map<string, number>;
}) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <div className="px-2 pb-4 pt-1">
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = appointments.filter((a) => isSameDay(new Date(a.start_time), day)).length;
            const absenceCount = getDayAbsences(absences, day).length;
            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  'flex flex-col items-center min-w-[40px] px-1.5 py-1 rounded-lg transition-colors flex-shrink-0',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted/40',
                  isToday && !isSelected && 'ring-1 ring-primary/40',
                )}
              >
                <span className={cn('text-[9px] font-medium uppercase', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                </span>
                <span className={cn('text-[13px] font-bold leading-tight', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                  {format(day, 'd')}
                </span>
                <div className="flex items-center gap-0.5 mt-0.5">
                  {count > 0 && (
                    <span className={cn('text-[8px] font-semibold', isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {count}
                    </span>
                  )}
                  {absenceCount > 0 && (
                    <span
                      title={`${absenceCount} ausência(s)`}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isSelected ? 'bg-primary-foreground/80' : 'bg-destructive',
                      )}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <DayTimelineList
          date={selectedDate}
          appointments={appointments}
          absences={absences}
          professionals={professionals}
          onAppointmentClick={onAppointmentClick}
          onAbsenceClick={onAbsenceClick}
          packageSequenceMap={packageSequenceMap}
        />
      </div>
    </ScrollArea>
  );
}

// ─── Month View ─────────────────────────────────────────
function MobileMonthView({ selectedDate, appointments, absences, onDateSelect }: {
  selectedDate: Date;
  appointments: Appointment[];
  absences: ProfessionalAbsence[];
  professionals: Professional[];
  onDateSelect: (date: Date) => void;
}) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfMonth = getDay(monthStart);
  const padStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const prevDays = Array.from({ length: padStart }, (_, i) => addDays(monthStart, -(padStart - i)));

  const lastDay = getDay(monthEnd);
  const padEnd = lastDay === 0 ? 0 : 7 - lastDay;
  const nextDays = Array.from({ length: padEnd }, (_, i) => addDays(monthEnd, i + 1));

  const allDays = [...prevDays, ...days, ...nextDays];

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <div className="px-2 pb-4 pt-1">
        <div className="grid grid-cols-7 mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {allDays.map((day) => {
            const isCurrentMonth = isSameMonth(day, selectedDate);
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = appointments.filter((a) => isSameDay(new Date(a.start_time), day)).length;
            const hasAbsence = getDayAbsences(absences, day).length > 0;

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  'relative flex flex-col items-center justify-center py-1.5 rounded-md transition-colors min-h-[36px]',
                  isSelected ? 'bg-primary text-primary-foreground' : '',
                  isToday && !isSelected && 'ring-1 ring-primary/40',
                  !isCurrentMonth && 'opacity-30',
                )}
              >
                {hasAbsence && (
                  <span
                    className={cn(
                      'absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full',
                      isSelected ? 'bg-primary-foreground/80' : 'bg-destructive',
                    )}
                    title="Ausência registrada"
                  />
                )}
                <span className={cn('text-[12px] font-medium leading-tight', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                  {format(day, 'd')}
                </span>
                {count > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {count <= 3 ? (
                      Array.from({ length: count }).map((_, i) => (
                        <div key={i} className={cn('h-1 w-1 rounded-full', isSelected ? 'bg-primary-foreground/70' : 'bg-primary/60')} />
                      ))
                    ) : (
                      <span className={cn('text-[8px] font-bold', isSelected ? 'text-primary-foreground/80' : 'text-primary/70')}>
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

// ─── Shared ──────────────────────────────────
function DayTimelineList({ date, appointments, absences, professionals, onAppointmentClick, onAbsenceClick, packageSequenceMap }: {
  date: Date;
  appointments: Appointment[];
  absences: ProfessionalAbsence[];
  professionals: Professional[];
  onAppointmentClick: (a: Appointment) => void;
  onAbsenceClick?: (a: ProfessionalAbsence) => void;
  packageSequenceMap: Map<string, number>;
}) {
  const items = useMemo(() => buildTimeline(appointments, absences, date), [appointments, absences, date]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-[11px] text-muted-foreground">Sem agendamentos</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) =>
        item.kind === 'appointment' ? (
          <AppointmentRow
            key={`apt-${item.data.id}`}
            apt={item.data}
            professionals={professionals}
            onClick={() => onAppointmentClick(item.data)}
            packageSequenceMap={packageSequenceMap}
          />
        ) : (
          <AbsenceRow
            key={`abs-${item.data.id}`}
            absence={item.data}
            professionals={professionals}
            onClick={() => onAbsenceClick?.(item.data)}
          />
        ),
      )}
    </div>
  );
}

function AbsenceRow({ absence, professionals, onClick }: {
  absence: ProfessionalAbsence;
  professionals: Professional[];
  onClick?: () => void;
}) {
  const prof = professionals.find((p) => p.id === absence.professional_id) || absence.professional;
  const profColor = (prof as any)?.agenda_color || 'hsl(var(--destructive))';
  const start = new Date(absence.start_time);
  const end = new Date(absence.end_time);
  const isFullDay = start.getHours() === 0 && end.getHours() === 23 && end.getMinutes() >= 59;
  const timeStr = isFullDay
    ? 'Dia inteiro'
    : `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-destructive/30 bg-destructive/5 overflow-hidden',
        onClick && 'active:bg-destructive/10 cursor-pointer',
      )}
      style={{ borderLeftColor: profColor, borderLeftWidth: 3 }}
    >
      <div className="flex-shrink-0 w-9 text-center">
        <UserX className="h-3.5 w-3.5 text-destructive mx-auto" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-destructive truncate leading-tight">
          Ausência {prof?.name ? `· ${prof.name.split(' ')[0]}` : ''}
        </p>
        <p className="text-[10px] text-muted-foreground truncate leading-tight tabular-nums">
          {timeStr}
          {absence.reason ? ` · ${absence.reason}` : ''}
        </p>
      </div>
    </div>
  );
}

function AppointmentRow({ apt, professionals, onClick, packageSequenceMap }: {
  apt: Appointment;
  professionals: Professional[];
  onClick: () => void;
  packageSequenceMap: Map<string, number>;
}) {
  const profId = apt.professional_id || apt.service?.professional_id;
  const prof = professionals.find((p) => p.id === profId);
  const profColor = prof?.agenda_color || '#94a3b8';
  const timeStr = format(new Date(apt.start_time), 'HH:mm');
  const dot = getAppointmentStatusConfig(apt.status).dotClassName;
  const payment = paymentConfig[apt.payment_status as keyof typeof paymentConfig] || paymentConfig.pending;
  const PaymentIcon = payment.icon;
  const packageData = apt.package_appointment?.package;
  const displayName = packageData?.name || apt.service?.name || 'Serviço';
  const applicationLabel = packageData ? getAppointmentPackageApplicationLabel(apt, packageSequenceMap.get(apt.id)) : null;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-card border border-border/40 active:bg-muted/50 transition-colors overflow-hidden"
      style={{
        borderLeftColor: profColor,
        borderLeftWidth: '3px',
        background: `linear-gradient(to right, ${profColor}10, transparent 30%)`,
      }}
    >
      <div className="flex-shrink-0 w-9 text-center">
        <span className="text-[11px] font-bold text-foreground leading-none tabular-nums">{timeStr}</span>
        <p className="text-[8px] text-muted-foreground leading-tight mt-0.5">{apt.service?.duration || 30}min</p>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
          {apt.client?.name || 'Cliente'}
        </p>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">
          {displayName}
        </p>
        {applicationLabel && (
          <p className="text-[9px] text-primary font-medium truncate leading-tight">{applicationLabel}</p>
        )}
        {prof && (
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <div
              className="h-1 w-1 rounded-full flex-shrink-0"
              style={{ backgroundColor: profColor, boxShadow: `0 0 0 1px ${profColor}40` }}
            />
            <span className="text-[9px] font-medium truncate" style={{ color: profColor }}>
              {prof.name.split(' ')[0]}
            </span>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1 pl-1">
        <div className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        <PaymentIcon className={cn('h-3 w-3', payment.className)} />
      </div>
    </div>
  );
}
