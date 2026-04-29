export function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour === '24' ? '0' : values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

export function createDateTimeInTimeZone(date: Date, time: string, timeZone = 'America/Sao_Paulo'): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
  let utcTime = localAsUtc;

  for (let i = 0; i < 3; i += 1) {
    utcTime = localAsUtc - getTimeZoneOffsetMs(timeZone, new Date(utcTime));
  }

  return new Date(utcTime);
}

export function formatTimeInTimeZone(value: string | Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}