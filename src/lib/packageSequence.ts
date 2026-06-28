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

export const buildActivePackageSessionSequenceMap = <T extends SequencedPackageSession>(sessions: T[]) => {
  const map = new Map<string, number>();
  sortPackageSessionsByChronologicalSequence(sessions)
    .filter((session) => session.appointment_id || session.status !== 'pending')
    .forEach((session, index) => {
      map.set(session.id, index + 1);
    });
  return map;
};

export const buildAppointmentPackageSequenceMap = (appointments: Appointment[]) => {
  const grouped = new Map<string, Appointment[]>();

  appointments.forEach((appointment) => {
    const packageId = appointment.package_appointment?.package_id || appointment.package_appointment?.package?.id;
    if (!packageId || !appointment.package_appointment) return;

    // Histórico inativo (cancelado/reagendado) deve manter o número original da
    // aplicação, mas não pode deslocar a numeração ativa do pacote no perfil.
    if (appointment.status === 'cancelled' || appointment.status === 'rescheduled') return;

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
        return (getPreservedPackageSessionNumber(a.package_appointment) || 0) - (getPreservedPackageSessionNumber(b.package_appointment) || 0);
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

export const countRealizedPackageSessions = (statuses: Array<string | null | undefined>) => {
  return statuses.filter(isPackageSessionRealized).length;
};

export const getAppointmentPackageApplicationLabel = (appointment: Appointment, sequenceNumber?: number | null) => {
  return getPackageApplicationLabel(
    appointment.package_appointment,
    appointment.package_appointment?.package?.total_sessions,
    sequenceNumber,
  );
};

type RecurringAppointment = Pick<Appointment, 'id' | 'start_time' | 'created_at' | 'recurring_group_id' | 'status' | 'notes'>;

const inactiveRecurringStatuses = new Set(['cancelled', 'rescheduled']);

export const buildAppointmentRecurringSequenceMap = (appointments: RecurringAppointment[]) => {
  const grouped = new Map<string, RecurringAppointment[]>();

  appointments.forEach((appointment) => {
    if (!appointment.recurring_group_id || inactiveRecurringStatuses.has(appointment.status)) return;
    const current = grouped.get(appointment.recurring_group_id) || [];
    current.push(appointment);
    grouped.set(appointment.recurring_group_id, current);
  });

  const map = new Map<string, { index: number; total: number }>();
  grouped.forEach((seriesAppointments) => {
    const ordered = seriesAppointments.slice().sort((a, b) => {
      const dateA = new Date(a.start_time).getTime();
      const dateB = new Date(b.start_time).getTime();
      if (dateA !== dateB) return dateA - dateB;

      const createdA = new Date(a.created_at || 0).getTime();
      const createdB = new Date(b.created_at || 0).getTime();
      if (createdA !== createdB) return createdA - createdB;

      return a.id.localeCompare(b.id);
    });

    ordered.forEach((appointment, index) => {
      map.set(appointment.id, { index: index + 1, total: ordered.length });
    });
  });

  return map;
};

export const getAppointmentRecurringSessionLabel = (sequence?: { index: number; total: number } | null) => {
  if (!sequence) return null;
  return `Sessão ${sequence.index} de ${sequence.total}`;
};

export const formatAppointmentNotesWithRecurringSequence = (
  notes?: string | null,
  sequence?: { index: number; total: number } | null,
) => {
  if (!notes) return notes;
  const label = getAppointmentRecurringSessionLabel(sequence);
  if (!label) return notes;
  return notes.replace(/Sessão\s+\d+\s+de\s+\d+/gi, label);
};