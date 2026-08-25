/**
 * Regras puras dos avisos enviados ao administrador ANTES de:
 *  - o fim da carência de um pagamento recusado;
 *  - a renovação da assinatura (mensal, semestral ou anual);
 *  - a cobrança automática do fim do teste gratuito.
 *
 * Usado tanto no aplicativo (faixa de aviso no topo) quanto na função de
 * back-end que dispara os e-mails diários.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias em que o aviso é disparado (antes da data limite). */
export const REMINDER_DAYS = [7, 3, 1] as const;

/** Janela (em dias) em que a faixa de aviso aparece no aplicativo. */
export const RENEWAL_BANNER_DAYS = 7;

export type BillingInterval = 'mensal' | 'semestral' | 'anual' | 'trimestral' | null;

/** Rótulo do ciclo a partir do intervalo de cobrança. */
export function billingIntervalLabel(
  interval?: string | null,
  intervalCount?: number | null,
): BillingInterval {
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1;
  if (interval === 'year') return count === 1 ? 'anual' : null;
  if (interval === 'month') {
    if (count === 1) return 'mensal';
    if (count === 3) return 'trimestral';
    if (count === 6) return 'semestral';
    if (count === 12) return 'anual';
  }
  return null;
}

/** Dias inteiros restantes até `target` (0 quando já passou). */
export function daysUntil(target: string | number | null | undefined, now: number = Date.now()): number | null {
  if (target === null || target === undefined) return null;
  const ms = typeof target === 'number' ? target : new Date(target).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= now) return 0;
  return Math.max(1, Math.ceil((ms - now) / DAY_MS));
}

/** true quando falta exatamente um dos marcos de aviso (7, 3 ou 1 dia). */
export function isReminderDay(daysLeft: number | null): boolean {
  if (daysLeft === null) return false;
  return (REMINDER_DAYS as readonly number[]).includes(daysLeft);
}

export interface RenewalNoticeInput {
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'grandfathered';
  is_grandfathered: boolean;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

export interface RenewalNotice {
  kind: 'renewal' | 'trial_charge';
  daysLeft: number;
  date: string;
}

/**
 * Aviso de renovação/cobrança próxima para assinaturas regulares.
 * Retorna null quando não há nada a avisar (vitalício, sem data, fora da janela).
 */
export function getRenewalNotice(
  sub: RenewalNoticeInput | null | undefined,
  now: number = Date.now(),
  windowDays: number = RENEWAL_BANNER_DAYS,
): RenewalNotice | null {
  if (!sub) return null;
  if (sub.is_grandfathered || sub.status === 'grandfathered') return null;

  if (sub.status === 'trial') {
    const daysLeft = daysUntil(sub.trial_ends_at, now);
    if (daysLeft === null || daysLeft === 0 || daysLeft > windowDays) return null;
    return { kind: 'trial_charge', daysLeft, date: sub.trial_ends_at as string };
  }

  if (sub.status !== 'active') return null;
  const daysLeft = daysUntil(sub.current_period_end, now);
  if (daysLeft === null || daysLeft === 0 || daysLeft > windowDays) return null;
  return { kind: 'renewal', daysLeft, date: sub.current_period_end as string };
}
