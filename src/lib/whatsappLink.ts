import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildAppointmentConfirmUrl } from '@/lib/publicRoutes';

/** Normalizes phone for WhatsApp links (digits only, with country code). Adds 55 if Brazilian and missing. */
export function normalizePhoneForWaMe(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return digits;
}

/**
 * Build the direct desktop WhatsApp Web URL.
 * `wa.me` can redirect some browsers to api.whatsapp.com, which is exactly the
 * blocked page reported by users. Opening web.whatsapp.com directly avoids that
 * intermediate API page and restores the previous desktop behavior.
 */
export function buildWebWhatsappUrl(phone: string, message: string): string {
  const digits = normalizePhoneForWaMe(phone);
  const text = encodeURIComponent(message || '');
  return digits
    ? `https://web.whatsapp.com/send?phone=${digits}${text ? `&text=${text}` : ''}`
    : `https://web.whatsapp.com/send${text ? `?text=${text}` : ''}`;
}

export type WhatsappOpenRoute = 'whatsapp://send' | 'web.whatsapp.com';

export interface WhatsappRouteLog {
  route: WhatsappOpenRoute;
  status: 'attempted' | 'opened' | 'blocked' | 'failed';
  url: string;
  timestamp: string;
  reason?: string;
}

export interface WhatsappOpenResult {
  ok: boolean;
  route: WhatsappOpenRoute | null;
  url: string | null;
  fallbackUrl: string;
  fallbackScheduled: boolean;
}

export interface WhatsappOpenOptions {
  preferNativeApp?: boolean;
  onRoute?: (log: WhatsappRouteLog) => void;
}

const WHATSAPP_ROUTE_STORAGE_KEY = 'horapro:last-whatsapp-route';

function recordWhatsappRoute(
  route: WhatsappOpenRoute,
  status: WhatsappRouteLog['status'],
  url: string,
  reason?: string,
  onRoute?: (log: WhatsappRouteLog) => void,
) {
  const log: WhatsappRouteLog = {
    route,
    status,
    url,
    timestamp: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };

  try {
    sessionStorage.setItem(WHATSAPP_ROUTE_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage can be unavailable in private browsing or restricted iframes.
  }

  try {
    window.dispatchEvent(new CustomEvent('whatsapp-route', { detail: log }));
  } catch {
    // CustomEvent is best-effort only; the console log below is the durable fallback.
  }

  console.info('[WhatsApp] Rota de abertura registrada', log);
  onRoute?.(log);
}

/** Build a native WhatsApp deep link for phones/tablets with the app installed. */
export function buildWhatsappAppUrl(phone: string, message: string): string {
  const digits = normalizePhoneForWaMe(phone);
  const text = encodeURIComponent(message || '');
  return digits
    ? `whatsapp://send?phone=${digits}&text=${text}`
    : `whatsapp://send?text=${text}`;
}

function shouldPreferNativeWhatsapp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Opens WhatsApp without wa.me/api.whatsapp.com redirects. Desktop browsers go
 * straight to WhatsApp Web; mobile devices can use the installed WhatsApp app.
 */
export function openWhatsappWithMessage(
  phone: string,
  message: string,
  options: WhatsappOpenOptions = {},
): WhatsappOpenResult {
  const webUrl = buildWebWhatsappUrl(phone, message);
  const appUrl = buildWhatsappAppUrl(phone, message);
  const preferNativeApp = options.preferNativeApp ?? shouldPreferNativeWhatsapp();
  const primaryRoute: WhatsappOpenRoute = preferNativeApp ? 'whatsapp://send' : 'web.whatsapp.com';
  const primaryUrl = preferNativeApp ? appUrl : webUrl;

  try {
    const popup = window.open(primaryUrl, '_blank');
    try {
      if (popup) popup.opener = null;
    } catch {
      // Some browsers lock this property after opening external URLs.
    }
    recordWhatsappRoute(
      primaryRoute,
      popup ? 'opened' : 'blocked',
      primaryUrl,
      popup ? 'WhatsApp aberto pela rota direta configurada' : 'Popup bloqueado pelo navegador',
      options.onRoute,
    );

    return {
      ok: !!popup,
      route: popup ? primaryRoute : null,
      url: popup ? primaryUrl : null,
      fallbackUrl: webUrl,
      fallbackScheduled: false,
    };
  } catch {
    const fallback = window.open(webUrl, '_blank');
    try {
      if (fallback) fallback.opener = null;
    } catch {
      // Best-effort only.
    }
    recordWhatsappRoute(
      'web.whatsapp.com',
      fallback ? 'opened' : 'failed',
      webUrl,
      'Exceção ao abrir WhatsApp; usando WhatsApp Web direto',
      options.onRoute,
    );

    return {
      ok: !!fallback,
      route: fallback ? 'web.whatsapp.com' : null,
      url: fallback ? webUrl : null,
      fallbackUrl: webUrl,
      fallbackScheduled: false,
    };
  }
}


export interface TemplateRenderContext {
  clientName?: string;
  serviceName?: string;
  professionalName?: string;
  appointmentDate?: Date | string | null;
  appointmentTime?: string | null;
  /** Token único do agendamento para gerar links de confirmar/cancelar. */
  confirmationToken?: string | null;
  /** Adiciona ao final da mensagem um bloco com botões de Confirmar/Cancelar. */
  includeConfirmationButtons?: boolean;
}

function firstName(full?: string): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] || '';
}

function normalizeTemplateKey(key: string): string {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function fullExtendedDate(d: Date): string {
  // Ex: "segunda-feira, 1 de junho de 2026"
  return format(d, "EEEE',' d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function fullExtendedDateNoYear(d: Date): string {
  // Ex: "segunda-feira, 1 de junho"
  return format(d, "EEEE',' d 'de' MMMM", { locale: ptBR });
}

function shortDate(d: Date): string {
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function shortDateNoYear(d: Date): string {
  return format(d, 'dd/MM', { locale: ptBR });
}

/** Replaces template variables. Supports both {{var}} and {var} syntaxes (UI mostra apenas {var}). */
export function renderTemplate(template: string, ctx: TemplateRenderContext): string {
  if (!template) return '';
  let date: Date | null = null;
  if (ctx.appointmentDate) {
    date = ctx.appointmentDate instanceof Date
      ? ctx.appointmentDate
      : new Date(`${String(ctx.appointmentDate).slice(0, 10)}T12:00:00`);
    if (isNaN(date.getTime())) date = null;
  }

  const confirmUrl = ctx.confirmationToken ? buildAppointmentConfirmUrl(ctx.confirmationToken, 'confirm') : '';
  const cancelUrl = ctx.confirmationToken ? buildAppointmentConfirmUrl(ctx.confirmationToken, 'cancel') : '';
  const linkAgendamento = ctx.confirmationToken ? buildAppointmentConfirmUrl(ctx.confirmationToken) : '';

  const vars: Record<string, string> = {
    cliente: ctx.clientName || '',
    nome: ctx.clientName || '',
    nome_cliente: ctx.clientName || '',
    cliente_nome: ctx.clientName || '',
    client: ctx.clientName || '',
    client_name: ctx.clientName || '',
    primeiro_nome: firstName(ctx.clientName),
    primeironome: firstName(ctx.clientName),
    servico: ctx.serviceName || '',
    servico_nome: ctx.serviceName || '',
    service: ctx.serviceName || '',
    service_name: ctx.serviceName || '',
    profissional: ctx.professionalName || '',
    professional: ctx.professionalName || '',
    professional_name: ctx.professionalName || '',
    data: date ? shortDate(date) : '',
    data_sem_ano: date ? shortDateNoYear(date) : '',
    datasemano: date ? shortDateNoYear(date) : '',
    data_extenso: date ? fullExtendedDate(date) : '',
    data_extenso_sem_ano: date ? fullExtendedDateNoYear(date) : '',
    horario: ctx.appointmentTime || '',
    hora: ctx.appointmentTime || '',
    time: ctx.appointmentTime || '',
    link_confirmar: confirmUrl,
    link_cancelar: cancelUrl,
    link_agendamento: linkAgendamento,
  };

  let rendered = template.replace(/\{\{?\s*([a-zA-ZÀ-ÿ_\s-]+)\s*\}?\}/g, (_m, key) => {
    const v = vars[normalizeTemplateKey(key)];
    return v !== undefined ? v : _m;
  });

  if (ctx.includeConfirmationButtons && ctx.confirmationToken) {
    const block = `\n\nResponda esta mensagem com *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.`;
    if (!rendered.includes('CONFIRMAR') || !rendered.includes('CANCELAR')) rendered += block;
  }

  return rendered;
}

/**
 * Adjusts a desired send hour (0-23) to fit within a quiet-hours window [start, end).
 * If the hour is before the start, returns start; if at/after the end, returns end-1.
 * Returns the hour unchanged when it already fits the window or the window is invalid.
 */
export function adjustHourToQuietWindow(
  desiredHour: number,
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
): number {
  const h = Math.max(0, Math.min(23, Math.floor(desiredHour)));
  if (quietStart == null || quietEnd == null) return h;
  const s = Math.max(0, Math.min(23, Math.floor(quietStart)));
  const e = Math.max(1, Math.min(24, Math.floor(quietEnd)));
  if (s >= e) return h;
  if (h < s) return s;
  if (h >= e) return e - 1;
  return h;
}

