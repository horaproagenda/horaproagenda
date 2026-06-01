import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Normalizes phone for wa.me (digits only, with country code). Adds 55 if Brazilian and missing. */
export function normalizePhoneForWaMe(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return digits;
}

/** Build a wa.me URL that opens WhatsApp (Web or installed app) with prefilled message. */
export function buildWaMeUrl(phone: string, message: string): string {
  const digits = normalizePhoneForWaMe(phone);
  const text = encodeURIComponent(message || '');
  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/** Opens WhatsApp in a new tab using the device/browser session (Web or installed app). */
export function openWhatsappWithMessage(phone: string, message: string): boolean {
  const url = buildWaMeUrl(phone, message);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  return !!win;
}

export interface TemplateRenderContext {
  clientName?: string;
  serviceName?: string;
  professionalName?: string;
  appointmentDate?: Date | string | null;
  appointmentTime?: string | null;
}

function firstName(full?: string): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] || '';
}

function fullExtendedDate(d: Date): string {
  // Ex: "segunda-feira, 1 de junho de 2026"
  return format(d, "EEEE',' d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function shortDate(d: Date): string {
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/** Replaces template variables. Supports both {{var}} and {var} syntaxes. */
export function renderTemplate(template: string, ctx: TemplateRenderContext): string {
  if (!template) return '';
  let date: Date | null = null;
  if (ctx.appointmentDate) {
    date = ctx.appointmentDate instanceof Date
      ? ctx.appointmentDate
      : new Date(`${String(ctx.appointmentDate).slice(0, 10)}T12:00:00`);
    if (isNaN(date.getTime())) date = null;
  }

  const vars: Record<string, string> = {
    cliente: ctx.clientName || '',
    nome: ctx.clientName || '',
    primeiro_nome: firstName(ctx.clientName),
    servico: ctx.serviceName || '',
    profissional: ctx.professionalName || '',
    data: date ? shortDate(date) : '',
    data_extenso: date ? fullExtendedDate(date) : '',
    horario: ctx.appointmentTime || '',
  };

  return template.replace(/\{\{?\s*([a-zA-Z_]+)\s*\}?\}/g, (_m, key) => {
    const v = vars[String(key).toLowerCase()];
    return v !== undefined ? v : _m;
  });
}
