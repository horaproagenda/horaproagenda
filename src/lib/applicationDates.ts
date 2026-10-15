import { format } from 'date-fns';
import { formatTimeInTimeZone } from './timezone';

/** Invalid historical values must never crash the entire clinical form. */
export function applicationDate(value: string): Date | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function applicationLocalInput(value: string): string {
  const date = applicationDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${formatTimeInTimeZone(date)}`;
}

export function applicationDateLabel(value: string): string {
  const local = applicationLocalInput(value);
  return local ? `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} ${local.slice(11)}` : 'Data indisponível';
}

export function isApplicationLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = applicationDate(value);
  return date !== null && format(date, "yyyy-MM-dd'T'HH:mm") === value;
}