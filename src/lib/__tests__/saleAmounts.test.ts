import { describe, it, expect } from 'vitest';
import { resolveSaleAmounts, pendingAfterDiscount } from '../saleAmounts';

describe('valores da venda com desconto', () => {
  it('pacote de R$ 2.200 com R$ 400 de desconto mostra R$ 1.800 pago', () => {
    const r = resolveSaleAmounts({ original_amount: 2200, discount_amount: 400, final_amount: 1800 });
    expect(r).toEqual({ fullAmount: 2200, discountAmount: 400, netAmount: 1800 });
  });
  it('desconto não gera pendência', () => {
    expect(pendingAfterDiscount(2200, 400, 1800)).toBe(0);
  });
  it('sem valor integral gravado, integral = pago + desconto', () => {
    expect(resolveSaleAmounts({ discount_amount: 400, final_amount: 1800 }).fullAmount).toBe(2200);
  });
});
