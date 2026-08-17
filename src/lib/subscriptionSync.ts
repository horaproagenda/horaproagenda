/**
 * Sincronização de assinatura após o retorno do Stripe.
 *
 * Usado nas telas de retorno (checkout de plano, cadastro com cartão para o
 * teste gratuito e portal do cliente) para liberar o aplicativo automaticamente
 * assim que o pagamento / cartão é registrado, sem depender do webhook.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionAccessLike } from '@/lib/subscriptionAccess';

export interface SyncedSubscription extends SubscriptionAccessLike {
  id?: string;
  seat_limit?: number;
  plan_tier?: number | null;
}

/** Chama check-subscription ignorando falhas (rede/edge fora do ar). */
export async function syncSubscriptionWithStripe(): Promise<void> {
  try {
    await supabase.functions.invoke('check-subscription');
  } catch (e) {
    console.warn('[subscriptionSync] check-subscription falhou:', e);
  }
}

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
 * ativa, vitalícia ou em teste gratuito vigente (cartão salvo no cadastro).
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
}

/**
 * Aguarda até que a assinatura libere o acesso, forçando a sincronização com o
 * Stripe a cada tentativa. Resolve com a assinatura liberada ou `null`.
 */
export async function waitForSubscriptionAccess(
  options: WaitOptions = {},
): Promise<SyncedSubscription | null> {
  const { timeoutMs = 30_000, intervalMs = 1_500, isCancelled } = options;
  const deadline = Date.now() + timeoutMs;

  // Primeira leitura: talvez o webhook já tenha ativado a conta.
  let sub = await fetchMySubscription();
  if (grantsAppAccess(sub)) return sub;

  await syncSubscriptionWithStripe();

  while (!isCancelled?.() && Date.now() < deadline) {
    sub = await fetchMySubscription();
    if (grantsAppAccess(sub)) return sub;
    await new Promise((r) => setTimeout(r, intervalMs));
    if (isCancelled?.()) break;
    await syncSubscriptionWithStripe();
  }

  sub = await fetchMySubscription();
  return grantsAppAccess(sub) ? sub : null;
}
