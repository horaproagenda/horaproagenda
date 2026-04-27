import { Appointment, PackageAppointment } from '@/types';

type SequencedPackageSession = Partial<PackageAppointment> & {
  id: string;
  appointment?: Pick<Appointment, 'start_time' | 'end_time' | 'status'> | null;
};

export const getPreservedPackageSessionNumber = (session?: PackageAppointment | null) => {
  if (!session) return null;
  return session.original_session_number || session.session_number || null;
};

export const getPackageApplicationLabel = (
  session?: PackageAppointment | null,
  totalSessions?: number | null,
  sequenceNumber?: number | null,
) => {
  const number = sequenceNumber || getPreservedPackageSessionNumber(session);
  if (!number) return '-';
  return `Aplicação ${number}/${totalSessions || '-'}`;
};

export const getPackageSessionSequenceDate = (session?: SequencedPackageSession | null) => {
  const dateValue = session?.appointment?.start_time || session?.scheduled_date || null;
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};

export const sortPackageSessionsByPreservedSequence = <T extends Pick<PackageAppointment, 'session_number' | 'original_session_number' | 'created_at'>>(
  sessions: T[],
) => {
  return sessions.slice().sort((a, b) => {
    const numberA = a.original_session_number || a.session_number || 0;
    const numberB = b.original_session_number || b.session_number || 0;
    if (numberA !== numberB) return numberA - numberB;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
};

export const sortPackageSessionsByChronologicalSequence = <T extends SequencedPackageSession>(sessions: T[]) => {
  return sessions.slice().sort((a, b) => {
    const dateA = getPackageSessionSequenceDate(a);
    const dateB = getPackageSessionSequenceDate(b);
    if (dateA !== dateB) return dateA - dateB;

    const numberA = a.original_session_number || a.session_number || 0;
    const numberB = b.original_session_number || b.session_number || 0;
    if (numberA !== numberB) return numberA - numberB;

    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
};

export const buildPackageSessionSequenceMap = <T extends SequencedPackageSession>(sessions: T[]) => {
  const map = new Map<string, number>();
  sortPackageSessionsByChronologicalSequence(sessions).forEach((session, index) => {
    map.set(session.id, index + 1);
  });
  return map;
};

export const buildAppointmentPackageSequenceMap = (appointments: Appointment[]) => {
  const grouped = new Map<string, Appointment[]>();

  appointments.forEach((appointment) => {
    const packageId = appointment.package_appointment?.package_id || appointment.package_appointment?.package?.id;
    if (!packageId || !appointment.package_appointment) return;
    const current = grouped.get(packageId) || [];
    current.push(appointment);
    grouped.set(packageId, current);
  });

  const map = new Map<string, number>();
  grouped.forEach((packageAppointments) => {
    packageAppointments
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.start_time).getTime();
        const dateB = new Date(b.start_time).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return getPreservedPackageSessionNumber(a.package_appointment) - getPreservedPackageSessionNumber(b.package_appointment);
      })
      .forEach((appointment, index) => {
        map.set(appointment.id, index + 1);
        if (appointment.package_appointment?.id) {
          map.set(appointment.package_appointment.id, index + 1);
        }
      });
  });

  return map;
};

export const isPackageSessionRealized = (status?: string | null) => {
  return status === 'completed' || status === 'missed';
};

export const getAppointmentPackageApplicationLabel = (appointment: Appointment, sequenceNumber?: number | null) => {
  return getPackageApplicationLabel(
    appointment.package_appointment,
    appointment.package_appointment?.package?.total_sessions,
    sequenceNumber,
  );
};