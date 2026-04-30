/**
 * Net Value Calculation Utilities
 * 
 * Ensures discounts and card fees are ALWAYS applied to the gross value
 * to produce a correct net (líquido) value across caixa, financeiro, and agenda.
 * 
 * Formula: netAmount = grossAmount - discountAmount - cardFeeAmount
 * 
 * Validation rules:
 * 1. Discount cannot exceed gross amount
 * 2. Card fee cannot exceed (gross - discount)
 * 3. Net amount must always be >= 0
 * 4. All amounts must be non-negative
 */

export interface NetValueInput {
  grossAmount: number;
  discountAmount?: number;
  cardFeeAmount?: number;
}

export interface NetValueResult {
  grossAmount: number;
  discountAmount: number;
  cardFeeAmount: number;
  netAmount: number;
  isValid: boolean;
  errors: string[];
}

/**
 * Calculate and validate net value from gross, discount, and card fee.
 * Always returns a valid result with clamped values if inputs are invalid.
 */
export function calculateNetValue(input: NetValueInput): NetValueResult {
  const errors: string[] = [];
  const gross = Math.max(0, Number(input.grossAmount) || 0);
  let discount = Math.max(0, Number(input.discountAmount) || 0);
  let cardFee = Math.max(0, Number(input.cardFeeAmount) || 0);

  // Validate: discount cannot exceed gross
  if (discount > gross) {
    errors.push(`Desconto (R$ ${discount.toFixed(2)}) excede o valor bruto (R$ ${gross.toFixed(2)})`);
    discount = gross;
  }

  // Validate: card fee cannot exceed (gross - discount)
  const afterDiscount = gross - discount;
  if (cardFee > afterDiscount) {
    errors.push(`Taxa de cartão (R$ ${cardFee.toFixed(2)}) excede o valor após desconto (R$ ${afterDiscount.toFixed(2)})`);
    cardFee = afterDiscount;
  }

  const netAmount = gross - discount - cardFee;

  return {
    grossAmount: gross,
    discountAmount: discount,
    cardFeeAmount: cardFee,
    netAmount: Math.max(0, netAmount),
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Apply net value validation to a sale/transaction object.
 * Returns corrected amounts ensuring consistency.
 */
export function validateSaleNetValue(sale: {
  original_amount?: number | null;
  final_amount?: number | null;
  discount_amount?: number | null;
  card_fee_amount?: number | null;
}): NetValueResult {
  const gross = Number(sale.original_amount || sale.final_amount || 0);
  return calculateNetValue({
    grossAmount: gross,
    discountAmount: Number(sale.discount_amount || 0),
    cardFeeAmount: Number(sale.card_fee_amount || 0),
  });
}

/**
 * Ensure a transaction's net amount is correctly computed.
 * Used when syncing between caixa, financeiro, and agenda.
 */
export function ensureNetAmount(
  amount: number,
  cardFee?: number | null,
  discount?: number | null
): number {
  const result = calculateNetValue({
    grossAmount: amount,
    discountAmount: Number(discount || 0),
    cardFeeAmount: Number(cardFee || 0),
  });
  return result.netAmount;
}
