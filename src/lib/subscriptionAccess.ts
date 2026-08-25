/**
 * Regras puras de bloqueio de acesso por assinatura.
 *
 * Diferencia dois cenários de "sem acesso":
 *  - PAGAMENTO RECUSADO (`payment_failed`): já existiu cobrança/assinatura no
 *    provedor de pagamento e ela falhou ou foi interrompida. Bloqueia todos os usuários da
 *    conta; só o administrador vê o botão de atualizar forma de pagamento.
 *  - SEM PLANO (`no_plan`): nunca assinou. O administrador é levado à tela de
 *    planos; os demais usuários veem aviso para procurar o administrador.
 */

export interface SubscriptionAccessLike {
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'grandfathered';
  trial_ends_at: string | null;
  is_grandfathered: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
  payment_provider?: string | null;
  current_period_end?: string | null;
}

export type BlockReason = 'payment_failed' | 'no_plan' | null;

/**
 * Dias de carência após a cobrança recusada (inclusive a cobrança automática do
 * fim do teste). Durante a carência o usuário continua usando o aplicativo, mas
 * recebe avisos com a ação de atualizar a forma de pagamento. Depois disso o
 * acesso é suspenso.
 */
export const PAYMENT_GRACE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** true quando o plano está regular (ativo, vitalício ou teste vigente). */
function isRegular(sub: SubscriptionAccessLike, now: number): boolean {
  if (sub.is_grandfathered || sub.status === 'grandfathered' || sub.status === 'active') return true;
  if (sub.status === 'trial') {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    return ends > now;
  }
  return false;
}

function hasPaymentProvider(sub: SubscriptionAccessLike): boolean {
  return Boolean(
    sub.asaas_customer_id ||
    sub.asaas_subscription_id ||
    sub.stripe_customer_id ||
    sub.stripe_subscription_id,
  );
}

/** Motivo do bloqueio ignorando carência (usado internamente e na UI). */
export function getBlockReason(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): BlockReason {
  if (!sub) return null;
  if (isRegular(sub, now)) return null;
  if (sub.status === 'past_due') return 'payment_failed';
  if (sub.status === 'canceled' && hasPaymentProvider(sub)) return 'payment_failed';
  // Teste encerrado com cobrança já criada = pagamento não aprovado.
  if (sub.status === 'trial' && hasPaymentProvider(sub)) return 'payment_failed';
  return 'no_plan';
}

/** Momento em que a cobrança falhou (fim do período pago ou fim do teste). */
export function getPaymentFailureAt(sub: SubscriptionAccessLike | null | undefined): number | null {
  if (!sub) return null;
  const ref = sub.current_period_end || sub.trial_ends_at;
  if (!ref) return null;
  const ms = new Date(ref).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Fim da carência (null quando não há carência aplicável). */
export function getGraceEndsAt(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): number | null {
  if (getBlockReason(sub, now) !== 'payment_failed') return null;
  const failedAt = getPaymentFailureAt(sub);
  if (failedAt === null) return null;
  return failedAt + PAYMENT_GRACE_DAYS * DAY_MS;
}

export type PaymentPhase = 'ok' | 'grace' | 'suspended';

/**
 * Fase do tratamento de cobrança recusada:
 *  - `ok`: nada a tratar (plano regular ou conta que nunca assinou).
 *  - `grace`: cobrança recusada, ainda dentro da carência — acesso liberado com avisos.
 *  - `suspended`: carência encerrada — acesso bloqueado.
 */
export function getPaymentPhase(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): PaymentPhase {
  if (getBlockReason(sub, now) !== 'payment_failed') return 'ok';
  const graceEnds = getGraceEndsAt(sub, now);
  if (graceEnds === null) return 'suspended';
  return graceEnds > now ? 'grace' : 'suspended';
}

/** Dias inteiros restantes de carência (0 quando já suspenso). */
export function getGraceDaysLeft(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): number {
  const graceEnds = getGraceEndsAt(sub, now);
  if (graceEnds === null || graceEnds <= now) return 0;
  return Math.max(1, Math.ceil((graceEnds - now) / DAY_MS));
}

export function hasSubscriptionAccess(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!sub) return true; // ainda carregando — não bloqueia
  if (isRegular(sub, now)) return true;
  // Cobrança recusada mantém o acesso durante a carência.
  return getPaymentPhase(sub, now) === 'grace';
}

