/** Valores oficiais de uma venda: integral, desconto e valor efetivamente cobrado. */
export interface SaleAmounts { fullAmount: number; discountAmount: number; netAmount: number }

export function resolveSaleAmounts(sale: { original_amount?: number | null; discount_amount?: number | null; final_amount?: number | null }, fallbackFull = 0): SaleAmounts {
  const net = Number(sale.final_amount || 0);
  const discount = Math.max(0, Number(sale.discount_amount || 0));
  const original = Number(sale.original_amount || 0);
  const full = original > 0 ? original : (fallbackFull > 0 ? fallbackFull : net + discount);
  return { fullAmount: full, discountAmount: discount, netAmount: net };
}

/** Saldo em aberto: o desconto nunca vira pendência. */
export function pendingAfterDiscount(fullAmount: number, discountAmount: number, paidAmount: number): number {
  return Math.max(0, Number((fullAmount - discountAmount - paidAmount).toFixed(2)));
}
