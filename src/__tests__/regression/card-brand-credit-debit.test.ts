import { describe, it, expect } from 'vitest';
import { planCardBrandVariants, cardFeePercentage, variantName } from '@/lib/cardBrandVariants';

describe('bandeiras separadas em crédito e débito', () => {
  it('bandeira "Ambos" vira Crédito e ganha Débito com a taxa à vista', () => {
    const plan = planCardBrandVariants([{ id: '1', name: 'Elo', type: 'both', is_active: true,
      fees: [{ installment_number: 1, fee_percentage: 2.5 }, { installment_number: 3, fee_percentage: 4 }] }]);
    expect(plan.renames).toEqual([{ id: '1', name: 'Elo - Crédito', type: 'credit' }]);
    expect(plan.creates[0]).toMatchObject({ name: 'Elo - Débito', type: 'debit', fees: [{ installment_number: 1, fee_percentage: 2.5 }] });
  });
  it('não duplica quando o par já existe', () => {
    const plan = planCardBrandVariants([
      { id: '1', name: 'Visa - Crédito', type: 'credit', is_active: true },
      { id: '2', name: 'Visa - Débito', type: 'debit', is_active: true },
    ]);
    expect(plan).toEqual({ renames: [], creates: [] });
  });
  it('débito sempre usa a taxa à vista; crédito usa a parcela', () => {
    const fees = [{ installment_number: 1, fee_percentage: 2 }, { installment_number: 6, fee_percentage: 7 }];
    expect(cardFeePercentage({ type: 'debit', fees }, 6)).toBe(2);
    expect(cardFeePercentage({ type: 'credit', fees }, 6)).toBe(7);
    expect(cardFeePercentage({ type: 'credit', fees }, 3)).toBe(2);
    expect(variantName('Elo - Débito', 'credit')).toBe('Elo - Crédito');
  });
});
