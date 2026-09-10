/**
 * Regras das datas de uso de uma compra de produto.
 *
 * REGRA DEFINITIVA: a data de início e a data de término de uso NUNCA são
 * preenchidas automaticamente ao registrar uma compra. Elas só existem quando
 * a pessoa digita manualmente no formulário.
 */

export interface PurchaseCycleDatesInput {
  usageStartDate?: string | null;
  usageEndDate?: string | null;
}

export interface PurchaseCycleDates {
  startedUsingAt: string | null;
  finishedAt: string | null;
}

const clean = (value?: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Retorna as datas que devem ser gravadas — sem qualquer preenchimento automático. */
export function resolvePurchaseCycleDates(input: PurchaseCycleDatesInput): PurchaseCycleDates {
  const startedUsingAt = clean(input.usageStartDate);
  const finishedAt = startedUsingAt ? clean(input.usageEndDate) : null;
  return { startedUsingAt, finishedAt };
}

/** Mensagem de erro amigável quando as datas informadas são incoerentes. */
export function validatePurchaseCycleDates(input: PurchaseCycleDatesInput): string | null {
  const start = clean(input.usageStartDate);
  const end = clean(input.usageEndDate);
  if (end && !start) return 'Informe a data de início de uso antes da data de término.';
  if (start && end && end < start) return 'A data de término de uso não pode ser anterior à data de início.';
  return null;
}
