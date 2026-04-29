export type PackageAvailabilitySession = {
  id?: string;
  status?: string | null;
  appointment_id?: string | null;
  scheduled_date?: string | null;
  session_number?: number | null;
  sequence_order?: number | null;
  interval_after_days?: number | null;
};

export type PackageAvailabilityInput = {
  total_sessions?: number | null;
  sessions_scheduled?: number | null;
  is_active?: boolean | null;
  package_type?: string | null;
  steps?: unknown[] | null;
  appointments?: PackageAvailabilitySession[] | null;
};

export const PACKAGE_CONSUMED_STATUSES = ['completed', 'missed'];

export const isConsumedPackageSession = (status?: string | null) =>
  PACKAGE_CONSUMED_STATUSES.includes(status || '');

export const getPackageAvailabilitySummary = (pkg: PackageAvailabilityInput) => {
  const sessions = pkg.appointments || [];
  const stepsCount = pkg.steps?.length || 0;
  const totalSessions = Math.max(Number(pkg.total_sessions || 0), sessions.length, stepsCount);
  const existingSessionRecords = sessions.length;
  const scheduledAppointments = sessions.filter(session => Boolean(session.appointment_id)).length;
  const consumedSessions = sessions.filter(session => isConsumedPackageSession(session.status)).length;
  const schedulableSessionRecords = sessions.filter(
    session => !isConsumedPackageSession(session.status) && !session.appointment_id,
  ).length;
  const missingSessionRecords = Math.max(0, totalSessions - existingSessionRecords);
  const legacyAvailableSessions = Math.max(0, totalSessions - Number(pkg.sessions_scheduled || 0));
  const schedulableSessions = sessions.length > 0
    ? schedulableSessionRecords + missingSessionRecords
    : legacyAvailableSessions;
  const remainingSessions = sessions.length > 0
    ? Math.max(0, totalSessions - consumedSessions)
    : legacyAvailableSessions;
  const hasInconsistentCounter = sessions.length > 0 && Number(pkg.sessions_scheduled || 0) !== scheduledAppointments;

  let unavailableReason = 'Disponível para agendar';
  if (pkg.is_active === false) {
    unavailableReason = 'Pacote inativo';
  } else if (totalSessions === 0) {
    unavailableReason = 'Sem sessões configuradas';
  } else if (schedulableSessions === 0 && consumedSessions >= totalSessions) {
    unavailableReason = 'Pacote completamente usado';
  } else if (schedulableSessions === 0 && scheduledAppointments > 0) {
    unavailableReason = 'Todas as sessões disponíveis já têm agendamento';
  } else if (schedulableSessions === 0) {
    unavailableReason = 'Sem sessão pendente disponível';
  }

  return {
    totalSessions,
    existingSessionRecords,
    scheduledAppointments,
    consumedSessions,
    schedulableSessions,
    remainingSessions,
    missingSessionRecords,
    stepsCount,
    hasInconsistentCounter,
    unavailableReason,
  };
};

export const shouldShowPackageInSelector = (pkg: PackageAvailabilityInput) => {
  const summary = getPackageAvailabilitySummary(pkg);
  return summary.schedulableSessions > 0 || summary.existingSessionRecords > 0 || summary.scheduledAppointments > 0;
};

export const isPackageLinkedAppointment = (appointment: {
  package_appointment_id?: string | null;
  package_appointment?: { id?: string | null; package?: { id?: string | null } | null } | null;
}) => Boolean(
  appointment.package_appointment_id
    || appointment.package_appointment?.id
    || appointment.package_appointment?.package?.id,
);

export const shouldKeepAppointmentVisibleInAgenda = (appointment: {
  status?: string | null;
  package_appointment_id?: string | null;
  package_appointment?: { id?: string | null; package?: { id?: string | null } | null } | null;
}) => appointment.status !== 'rescheduled' || isPackageLinkedAppointment(appointment);