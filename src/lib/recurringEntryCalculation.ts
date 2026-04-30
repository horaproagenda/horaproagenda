/**
 * Recurring Entry Calculation Utilities
 *
 * Handles the logic for splitting values across recurring entries/installments.
 * Two modes:
 *   - "diluted" (is_total_value = true): The informed amount is the TOTAL, divided equally among installments.
 *   - "integral" (is_total_value = false): The informed amount is the PER-INSTALLMENT value; total = amount × installments.
 *
 * Validation:
 *   - Amount must be > 0
 *   - Installments must be >= 1
 *   - Per-installment amount must be >= 0.01
 */

export interface RecurringCalcInput {
  amount: number;
  installments: number;
  isTotalValue: boolean; // true = diluted, false = integral per installment
}

export interface RecurringCalcResult {
  perInstallmentAmount: number;
  totalAmount: number;
  installments: number;
  mode: 'diluted' | 'integral';
  isValid: boolean;
  errors: string[];
}

export function calculateRecurringValues(input: RecurringCalcInput): RecurringCalcResult {
  const errors: string[] = [];
  const amount = Math.max(0, Number(input.amount) || 0);
  const installments = Math.max(1, Math.floor(Number(input.installments) || 1));

  if (amount <= 0) {
    errors.push('O valor deve ser maior que zero.');
  }

  let perInstallmentAmount: number;
  let totalAmount: number;

  if (input.isTotalValue) {
    // Diluted: total is the amount, each installment gets amount / installments
    totalAmount = amount;
    perInstallmentAmount = Math.round((amount / installments) * 100) / 100;
  } else {
    // Integral: each installment is the full amount
    perInstallmentAmount = amount;
    totalAmount = Math.round((amount * installments) * 100) / 100;
  }

  if (perInstallmentAmount < 0.01 && amount > 0) {
    errors.push('O valor por parcela é muito pequeno (mínimo R$ 0,01).');
  }

  return {
    perInstallmentAmount,
    totalAmount,
    installments,
    mode: input.isTotalValue ? 'diluted' : 'integral',
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate consistency between financial entry amounts and cash transaction amounts.
 * Returns divergence info if values don't match within a tolerance.
 */
export interface DivergenceCheckInput {
  financialTotal: number;
  cashTotal: number;
  label: string;
}

export interface DivergenceResult {
  hasDivergence: boolean;
  difference: number;
  message: string;
}

const TOLERANCE = 0.02; // R$ 0.02 tolerance for rounding

export function checkFinancialDivergence(input: DivergenceCheckInput): DivergenceResult {
  const diff = Math.abs(input.financialTotal - input.cashTotal);
  const hasDivergence = diff > TOLERANCE;

  return {
    hasDivergence,
    difference: Math.round(diff * 100) / 100,
    message: hasDivergence
      ? `${input.label}: diferença de R$ ${diff.toFixed(2)} entre financeiro (R$ ${input.financialTotal.toFixed(2)}) e caixa (R$ ${input.cashTotal.toFixed(2)})`
      : '',
  };
}
