import { createDateTimeInTimeZone } from './timezone';

export interface TimeRangeLike {
  start_time: string;
  end_time: string;
  professional_id?: string | null;
  room_id?: string | null;
  service?: {
    professional_id?: string | null;
    room_id?: string | null;
  } | null;
}

export interface AvailabilityConflictContext {
  appointments: TimeRangeLike[];
  absences?: TimeRangeLike[];
  selectedProfessional?: string | null;
  selectedRoom?: string | null;
}

export function calculateAppointmentTimesInTimeZone(
  date: Date,
  time: string,
  durationMinutes: number,
  timeZone = 'America/Sao_Paulo',
) {
  const startTime = createDateTimeInTimeZone(date, time, timeZone);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
  return { startTime, endTime };
}

export function hasTimeOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export function getAvailabilityConflictReason(
  startTime: Date,
  endTime: Date,
  { appointments, absences = [], selectedProfessional, selectedRoom }: AvailabilityConflictContext,
) {
  for (const absence of absences) {
    if (selectedProfessional && absence.professional_id === selectedProfessional) {
      const overlaps = hasTimeOverlap(startTime, endTime, new Date(absence.start_time), new Date(absence.end_time));
      if (overlaps) return 'Profissional ausente';
    }
  }

  for (const appointment of appointments) {
    const overlaps = hasTimeOverlap(startTime, endTime, new Date(appointment.start_time), new Date(appointment.end_time));
    if (!overlaps) continue;

    const appointmentProfessionalId = appointment.professional_id || appointment.service?.professional_id;
    if (selectedProfessional && appointmentProfessionalId === selectedProfessional) return 'Profissional ocupado';

    const appointmentRoomId = appointment.room_id || appointment.service?.room_id;
    if (selectedRoom && appointmentRoomId === selectedRoom) return 'Sala ocupada';
  }

  return '';
}