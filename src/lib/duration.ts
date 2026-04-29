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