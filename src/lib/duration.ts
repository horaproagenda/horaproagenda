export function formatDurationClock(minutes: number | null | undefined): string {
  const safeMinutes = Number.isFinite(Number(minutes)) ? Math.max(0, Number(minutes)) : 0;
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function parseDurationClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Soma minutos a um horário "HH:mm" e devolve o horário resultante como "HH:mm"
 * (relógio de parede 24h). Independe de fuso horário — evita bugs em que a
 * conversão para Date desloca o horário exibido.
 */
export function addMinutesToClock(time: string, minutesToAdd: number): string {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time || '');
  if (!match) return '';
  const startH = Number(match[1]);
  const startM = Number(match[2]);
  if (!Number.isFinite(startH) || !Number.isFinite(startM)) return '';
  const total = startH * 60 + startM + (Number.isFinite(minutesToAdd) ? Math.max(0, Math.round(minutesToAdd)) : 0);
  const normalized = ((total % 1440) + 1440) % 1440; // rola no dia (24h)
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}