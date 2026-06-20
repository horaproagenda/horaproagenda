/**
 * Rotas públicas (sem autenticação) do app.
 *
 * Mantém em um único lugar o path da rota e a função geradora de URL,
 * garantindo que o link gerado nunca aponte para um caminho que não exista
 * em `App.tsx` (evita o 404 reportado quando os dois ficam fora de sincronia).
 *
 * IMPORTANTE: ao alterar qualquer constante aqui, rode os testes
 * (`src/lib/publicRoutes.test.ts`) — eles verificam que `App.tsx` registra
 * todas as rotas públicas declaradas neste arquivo.
 */

export const CLIENT_REGISTRATION_ROUTE = '/cadastro-cliente/:token';
export const DOCUMENT_FILL_ROUTE = '/preencher-documento/:slug';
export const DOCUMENT_FILL_ROUTE_LEGACY = '/preencher-documento';
export const UNSUBSCRIBE_ROUTE = '/unsubscribe';
export const APPOINTMENT_CONFIRM_ROUTE = '/c/:token';

/** Lista usada pelos testes para validar que `App.tsx` registra todas elas. */
export const PUBLIC_ROUTES = [
  CLIENT_REGISTRATION_ROUTE,
  DOCUMENT_FILL_ROUTE,
  DOCUMENT_FILL_ROUTE_LEGACY,
  UNSUBSCRIBE_ROUTE,
  APPOINTMENT_CONFIRM_ROUTE,
] as const;

/** Base canônica para URLs públicas compartilhadas (WhatsApp, e-mail, etc.). */
export function getPublicBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://horaproagenda.app';
  const origin = window.location.origin;
  // Em previews do Lovable, sempre apontamos para o domínio publicado real
  // para que o link copiado funcione mesmo se o usuário estiver no preview.
  if (origin.includes('lovable.app') || origin.includes('lovable.dev')) {
    return 'https://horaproagenda.app';
  }
  return origin;
}

export function buildClientRegistrationUrl(token: string): string {
  return `${getPublicBaseUrl()}/cadastro-cliente/${token}`;
}

export function buildAppointmentConfirmUrl(token: string, action?: 'confirm' | 'cancel'): string {
  const base = `${getPublicBaseUrl()}/c/${token}`;
  return action ? `${base}?a=${action}` : base;
}
