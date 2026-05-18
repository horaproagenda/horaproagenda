import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type OutboxType = 'reminder' | 'confirmation' | 'follow_up' | 'birthday';

export interface OutboxItem {
  key: string;
  type: OutboxType;
  templateId: string;
  templateName: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  message: string;
  scheduledFor: Date;
  appointmentId?: string;
  serviceName?: string;
  professionalName?: string;
}

const STORAGE_KEY = 'whatsapp-outbox-sent';

export interface SentRecord {
  key: string;
  sentAt: string;
}

export function getSentRecords(): SentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: SentRecord[] = JSON.parse(raw);
    // Keep only last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = parsed.filter(r => new Date(r.sentAt).getTime() > cutoff);
    if (filtered.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

export function markSent(key: string) {
  const all = getSentRecords();
  if (all.some(r => r.key === key)) return;
  all.push({ key, sentAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function unmarkSent(key: string) {
  const all = getSentRecords().filter(r => r.key !== key);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function isSent(key: string): boolean {
  return getSentRecords().some(r => r.key === key);
}

export function renderTemplate(
  message: string,
  vars: { cliente?: string; data?: string; horario?: string; servico?: string; profissional?: string }
): string {
  return message
    .replaceAll('{{cliente}}', vars.cliente ?? '')
    .replaceAll('{{data}}', vars.data ?? '')
    .replaceAll('{{horario}}', vars.horario ?? '')
    .replaceAll('{{servico}}', vars.servico ?? '')
    .replaceAll('{{profissional}}', vars.profissional ?? '')
    // Also support {x} legacy syntax
    .replaceAll('{nome}', vars.cliente ?? '')
    .replaceAll('{cliente}', vars.cliente ?? '')
    .replaceAll('{data}', vars.data ?? '')
    .replaceAll('{horario}', vars.horario ?? '')
    .replaceAll('{servico}', vars.servico ?? '')
    .replaceAll('{profissional}', vars.profissional ?? '');
}

export function openWhatsappShare(phone: string | null | undefined, message: string) {
  const text = encodeURIComponent(message);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    window.open(`https://wa.me/${withCountry}?text=${text}`, '_blank', 'noopener,noreferrer');
  } else {
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }
}

export function formatAppointmentDate(iso: string): string {
  return format(parseISO(iso), "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function formatAppointmentTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm');
}
