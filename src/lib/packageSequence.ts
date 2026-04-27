import { Appointment, PackageAppointment } from '@/types';

export const getPreservedPackageSessionNumber = (session?: PackageAppointment | null) => {
  if (!session) return null;
  return session.original_session_number || session.session_number || null;
};

export const getPackageApplicationLabel = (
  session?: PackageAppointment | null,
  totalSessions?: number | null,
) => {
  const number = getPreservedPackageSessionNumber(session);
  if (!number) return '-';
  return `Aplicação ${number}/${totalSessions || '-'}`;
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

export const isPackageSessionRealized = (status?: string | null) => {
  return status === 'completed' || status === 'missed';
};

export const getAppointmentPackageApplicationLabel = (appointment: Appointment) => {
  return getPackageApplicationLabel(
    appointment.package_appointment,
    appointment.package_appointment?.package?.total_sessions,
  );
};