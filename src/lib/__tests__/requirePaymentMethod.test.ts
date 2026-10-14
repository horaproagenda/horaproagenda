import { describe, it, expect } from 'vitest';
import { requirePaymentMethod } from '../requirePaymentMethod';
describe('forma de pagamento obrigatória', () => {
  it('bloqueia baixa paga sem forma', () => { expect(requirePaymentMethod('paid', null)).not.toBeNull(); });
  it('permite baixa paga com forma', () => { expect(requirePaymentMethod('paid', 'pm-1')).toBeNull(); });
  it('pendente não exige forma', () => { expect(requirePaymentMethod('pending', null)).toBeNull(); });
});
