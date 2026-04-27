import { addDays, format, getDay, isSameDay, isSameMonth, startOfDay, endOfDay } from 'date-fns';
import { Appointment } from '@/types';

type AgendaViewType = 'day' | 'week' | 'month' | 'professional';

interface AbsenceSlotSource {
  start_time: string;
  end_time?: string;
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

  const daysInCurrentView = (() => {
    if (viewType === 'week') {
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(day => !(hideSunday && getDay(day) === 0));
    }
    if (viewType === 'month') {
      return Array.from({ length: endOfMonthDayCount(monthStart) }, (_, i) => addDays(startOfDay(monthStart), i));
    }
    return [selectedDate];
  })();

  const addVisibleStartSlots = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : start;

    daysInCurrentView.forEach(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const overlapsDay = start <= dayEnd && end >= dayStart;
      if (!overlapsDay) return;

      allSlots.add(format(isSameDay(start, day) ? start : dayStart, 'HH:mm'));
    });
  };

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
    addVisibleStartSlots(appointment.start_time, appointment.end_time);
  });

  absences.forEach(absence => {
    addVisibleStartSlots(absence.start_time, absence.end_time);
  });

  return Array.from(allSlots).sort((a, b) => a.localeCompare(b));
}

function endOfMonthDayCount(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}