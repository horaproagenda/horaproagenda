/**
 * Regras puras de bloqueio de acesso por assinatura.
 *
 * Diferencia dois cenários de "sem acesso":
 *  - PAGAMENTO RECUSADO (`payment_failed`): já existiu cobrança/assinatura no
 *    Stripe e ela falhou ou foi interrompida. Bloqueia todos os usuários da
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
}

export type BlockReason = 'payment_failed' | 'no_plan' | null;

export function hasSubscriptionAccess(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!sub) return true; // ainda carregando — não bloqueia
  if (sub.is_grandfathered || sub.status === 'grandfathered' || sub.status === 'active') return true;
  if (sub.status === 'trial') {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    return ends > now;
  }
  return false;
}

export function getBlockReason(
  sub: SubscriptionAccessLike | null | undefined,
  now: number = Date.now(),
): BlockReason {
  if (!sub) return null;
  if (hasSubscriptionAccess(sub, now)) return null;
  if (sub.status === 'past_due') return 'payment_failed';
  if (sub.status === 'canceled' && !!sub.stripe_customer_id) return 'payment_failed';
  // Teste encerrado com assinatura já criada no Stripe = cobrança não aprovada.
  if (sub.status === 'trial' && !!sub.stripe_subscription_id) return 'payment_failed';
  return 'no_plan';
}
