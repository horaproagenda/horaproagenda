import { addMinutes } from 'date-fns';

type CalendarAppointment = {
  id?: string | null;
  start_time: string;
  end_time: string;
  professional_id?: string | null;
  room_id?: string | null;
  status?: string | null;
};

type ConflictScope = {
  professional_id?: string | null;
  room_id?: string | null;
  ignoreAppointmentIds?: Array<string | null | undefined>;
};

export const overlapsTimeRange = (start: Date, end: Date, otherStart: Date, otherEnd: Date) =>
  start < otherEnd && end > otherStart;

export const findSchedulingConflict = (
  start: Date,
  durationMinutes: number,
  appointments: CalendarAppointment[],
  scope: ConflictScope,
) => {
  const end = addMinutes(start, durationMinutes);
  const ignored = new Set((scope.ignoreAppointmentIds || []).filter(Boolean));

  return appointments.find((appointment) => {
    if (appointment.id && ignored.has(appointment.id)) return false;
    if (['cancelled', 'missed'].includes(appointment.status || '')) return false;
    const sameProfessional = scope.professional_id && appointment.professional_id === scope.professional_id;
    const sameRoom = scope.room_id && appointment.room_id === scope.room_id;
    if (!sameProfessional && !sameRoom) return false;
    return overlapsTimeRange(start, end, new Date(appointment.start_time), new Date(appointment.end_time));
  });
};

export const findNextAvailablePackageSlot = (
  desiredStart: Date,
  durationMinutes: number,
  appointments: CalendarAppointment[],
  scope: ConflictScope,
) => {
  let candidate = new Date(desiredStart);

  for (let attempt = 0; attempt < 96; attempt += 1) {
    const conflict = findSchedulingConflict(candidate, durationMinutes, appointments, scope);
    if (!conflict) return candidate;
    candidate = addMinutes(new Date(conflict.end_time), 15);
  }

  throw new Error('Não foi possível encontrar horário livre para as próximas etapas do pacote. Ajuste a data/horário manualmente.');
};

export const isServiceCompatibleWithPackage = (
  service: { professional_id?: string | null; room_id?: string | null } | undefined,
  packageScope: { professional_id?: string | null; room_id?: string | null },
) => {
  if (!service) return false;
  if (packageScope.professional_id && service.professional_id && service.professional_id !== packageScope.professional_id) return false;
  if (packageScope.room_id && service.room_id && service.room_id !== packageScope.room_id) return false;
  return true;
};