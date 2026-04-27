import { addDays, format, getDay, isSameDay, isSameMonth } from 'date-fns';
import { Appointment } from '@/types';

type AgendaViewType = 'day' | 'week' | 'month' | 'professional';

interface AbsenceSlotSource {
  start_time: string;
}

interface MergeAgendaTimeSlotsParams {
  baseSlots: string[];
  appointments: Appointment[];
  absences: AbsenceSlotSource[];
  viewType: AgendaViewType;
  selectedDate: Date;
  weekStart: Date;
  monthStart: Date;
  hideSunday: boolean;
}

export function mergeAgendaTimeSlots({
  baseSlots,
  appointments,
  absences,
  viewType,
  selectedDate,
  weekStart,
  monthStart,
  hideSunday,
}: MergeAgendaTimeSlotsParams): string[] {
  const allSlots = new Set(baseSlots);

  const isDateInCurrentView = (date: Date) => {
    if (viewType === 'week') {
      if (hideSunday && getDay(date) === 0) return false;
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).some(day => isSameDay(date, day));
    }
    if (viewType === 'month') return isSameMonth(date, monthStart);
    return isSameDay(date, selectedDate);
  };

  appointments.forEach(appointment => {
    if (appointment.status === 'rescheduled') return;

    const appointmentStart = new Date(appointment.start_time);
    if (!isDateInCurrentView(appointmentStart)) return;

    allSlots.add(format(appointmentStart, 'HH:mm'));
  });

  absences.forEach(absence => {
    const absenceStart = new Date(absence.start_time);
    if (!isDateInCurrentView(absenceStart)) return;

    allSlots.add(format(absenceStart, 'HH:mm'));
  });

  return Array.from(allSlots).sort((a, b) => a.localeCompare(b));
}