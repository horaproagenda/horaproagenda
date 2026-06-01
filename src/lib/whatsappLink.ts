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

/** Build a web.whatsapp.com URL for browsers already logged into WhatsApp Web. */
export function buildWebWhatsappUrl(phone: string, message: string): string {
  const digits = normalizePhoneForWaMe(phone);
  const text = encodeURIComponent(message || '');
  return digits
    ? `https://web.whatsapp.com/send?phone=${digits}&text=${text}`
    : `https://web.whatsapp.com/send?text=${text}`;
}

export type WhatsappOpenRoute = 'whatsapp://send' | 'web.whatsapp.com/send';

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

const WHATSAPP_ROUTE_STORAGE_KEY = 'agendalume:last-whatsapp-route';

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
  const primaryRoute: WhatsappOpenRoute = preferNativeApp ? 'whatsapp://send' : 'web.whatsapp.com/send';
  const primaryUrl = preferNativeApp ? appUrl : webUrl;

  try {
    const popup = window.open(primaryUrl, '_blank', 'noopener,noreferrer');
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
    const fallback = window.open(webUrl, '_blank', 'noopener,noreferrer');
    recordWhatsappRoute(
      'web.whatsapp.com/send',
      fallback ? 'opened' : 'failed',
      webUrl,
      'Exceção ao abrir WhatsApp; usando WhatsApp Web direto',
      options.onRoute,
    );

    return {
      ok: !!fallback,
      route: fallback ? 'web.whatsapp.com/send' : null,
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

