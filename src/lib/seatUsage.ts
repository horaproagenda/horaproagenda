/**
 * Pure helpers para decisões de UI/notificação baseadas em uso de assentos.
 *
 * Regra de negócio (2026-07):
 *  - Só sugerimos upgrade quando o usuário está EFETIVAMENTE acima do limite
 *    do plano (`used > seat_limit`). Estar exatamente no limite não gera
 *    sugestão de upgrade — o cliente já pagou pelo que contratou.
 *  - Contas com `is_grandfathered` (vitalícias/cortesia) nunca sugerem upgrade.
 */

export interface SeatUsageLike {
  used: number;
  seat_limit: number;
  available: number;
  is_grandfathered: boolean;
}

export type SeatNotification = 'over' | null;

export function shouldSuggestUpgrade(usage: SeatUsageLike | null | undefined): SeatNotification {
  if (!usage) return null;
  if (usage.is_grandfathered) return null;
  if (!usage.seat_limit || usage.seat_limit <= 0) return null;
  if (usage.used > usage.seat_limit) return 'over';
  return null;
}

/** true quando o usuário não pode criar mais colaboradores (0 vagas). */
export function isSeatCapacityReached(usage: SeatUsageLike | null | undefined): boolean {
  if (!usage) return false;
  if (usage.is_grandfathered) return false;
  return (usage.available ?? 0) <= 0;
}
