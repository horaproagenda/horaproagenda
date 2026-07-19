// Retorna a duração REAL do agendamento (em minutos) para exibição na UI.
// Sempre prioriza (end_time - start_time), que é a fonte da verdade do horário
// efetivamente reservado. Só cai para `service.duration` quando não temos
// as datas — e mesmo assim descarta valores agregados absurdos (> 8h), que
// são erro de cadastro típico de serviços-kit ("Axila + Virilha Completa"
// com duração 760 min do pacote inteiro salva no serviço).
export interface AppointmentDurationLike {
  start_time?: string | Date | null;
  end_time?: string | Date | null;
  service?: { duration?: number | null } | null;
}

const AGGREGATE_THRESHOLD_MIN = 8 * 60;

export function getAppointmentDisplayDurationMinutes(
  appointment: AppointmentDurationLike | null | undefined,
  fallbackMinutes = 30,
): number {
  if (!appointment) return fallbackMinutes;
  const startRaw = appointment.start_time;
  const endRaw = appointment.end_time;
  if (startRaw && endRaw) {
    const startMs = startRaw instanceof Date ? startRaw.getTime() : new Date(startRaw).getTime();
    const endMs = endRaw instanceof Date ? endRaw.getTime() : new Date(endRaw).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return Math.round((endMs - startMs) / 60000);
    }
  }
  const serviceDuration = Number(appointment.service?.duration);
  if (Number.isFinite(serviceDuration) && serviceDuration > 0 && serviceDuration <= AGGREGATE_THRESHOLD_MIN) {
    return serviceDuration;
  }
  return fallbackMinutes;
}
