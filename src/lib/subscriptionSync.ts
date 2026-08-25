/**
 * Sincronização de assinatura após o retorno do Asaas.
 *
 * Usado nas telas de retorno (checkout de plano e fatura) para liberar o aplicativo automaticamente
 * assim que o pagamento / cartão é registrado, sem depender do webhook.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionAccessLike } from '@/lib/subscriptionAccess';

export interface SyncedSubscription extends SubscriptionAccessLike {
  id?: string;
  seat_limit?: number;
  plan_tier?: number | null;
}

/** Chama asaas-check-subscription ignorando falhas (rede/edge fora do ar). */
export async function syncSubscriptionWithAsaas(): Promise<void> {
  try {
    await supabase.functions.invoke('asaas-check-subscription');
  } catch (e) {
    console.warn('[subscriptionSync] asaas-check-subscription falhou:', e);
  }
}

/** @deprecated nome legado mantido para compatibilidade interna. */
export const syncSubscriptionWithStripe = syncSubscriptionWithAsaas;

/** Lê a assinatura atual da conta do usuário logado. */
export async function fetchMySubscription(): Promise<SyncedSubscription | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_my_subscription');
  if (error) {
    console.warn('[subscriptionSync] get_my_subscription falhou:', error);
    return null;
  }
  if (!data) return null;
  return (data.id ? data : Array.isArray(data) ? data[0] : null) ?? null;
}

/**
 * true quando a assinatura já libera o aplicativo:
 * ativa, vitalícia ou em teste gratuito vigente.
 */
export function grantsAppAccess(
  sub: SyncedSubscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!sub) return false;
  if (sub.is_grandfathered || sub.status === 'grandfathered' || sub.status === 'active') return true;
  if (sub.status === 'trial') {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    return ends > now;
  }
  return false;
}

interface WaitOptions {
  /** Tempo máximo de espera (padrão 30s). */
  timeoutMs?: number;
  /** Intervalo entre tentativas (padrão 1.5s). */
  intervalMs?: number;
  /** Cancelamento externo (desmontagem do componente). */
  isCancelled?: () => boolean;
  /**
   * Quando true, um teste gratuito vigente NÃO conta como liberação: só resolve
   * com assinatura paga (active/grandfathered). Usado no retorno do checkout
   * pago, onde a conta já nasce em teste e a leitura do registro antigo daria
   * um falso "teste gratuito começou".
   */
  requirePaid?: boolean;
}

/**
 * Aguarda até que a assinatura libere o acesso, forçando a sincronização com o
 * Asaas a cada tentativa. Resolve com a assinatura liberada ou `null`.
 */
export async function waitForSubscriptionAccess(
  options: WaitOptions = {},
): Promise<SyncedSubscription | null> {
  const { timeoutMs = 30_000, intervalMs = 1_500, isCancelled, requirePaid = false } = options;
  const deadline = Date.now() + timeoutMs;
  const isResolved = (candidate: SyncedSubscription | null) =>
    grantsAppAccess(candidate) && (!requirePaid || candidate?.status !== 'trial');

  // Primeira leitura: talvez o webhook já tenha ativado a conta.
  let sub = await fetchMySubscription();
  if (isResolved(sub)) return sub;

  await syncSubscriptionWithAsaas();

  while (!isCancelled?.() && Date.now() < deadline) {
    sub = await fetchMySubscription();
    if (isResolved(sub)) return sub;
    await new Promise((r) => setTimeout(r, intervalMs));
    if (isCancelled?.()) break;
    await syncSubscriptionWithAsaas();
  }

  sub = await fetchMySubscription();
  return isResolved(sub) ? sub : null;
}
