import { describe, it, expect } from 'vitest';
import { stepCommissionAmount } from '../stepCommission';

describe('comissão da etapa', () => {
  it('percentual da etapa aplica sobre o valor recebido', () => {
    expect(stepCommissionAmount({ commission_type_snapshot: 'percentage', commission_value_snapshot: 30 }, 200)).toBe(60);
  });
  it('valor fixo da etapa ignora o valor recebido', () => {
    expect(stepCommissionAmount({ commission_type_snapshot: 'fixed', commission_value_snapshot: 45 }, 200)).toBe(45);
  });
  it('sem comissão na etapa usa o padrão do profissional', () => {
    expect(stepCommissionAmount({ commission_type_snapshot: null }, 200)).toBeNull();
  });
});
