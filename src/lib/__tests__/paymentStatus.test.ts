import { describe, it, expect } from 'vitest';
import { derivePaymentStatus } from '../paymentStatus';

describe('derivePaymentStatus', () => {
  it('mantém pendente quando nada foi recebido', () => {
    expect(derivePaymentStatus({ price: 150, amountPaid: 0 })).toBe('pending');
  });

  it('não marca pago só porque existe algum valor', () => {
    expect(derivePaymentStatus({ price: 150, amountPaid: 50 })).toBe('partial');
  });

  it('considera o desconto no valor devido', () => {
    expect(derivePaymentStatus({ price: 150, discount: 10, amountPaid: 140 })).toBe('paid');
    expect(derivePaymentStatus({ price: 150, discount: 10, amountPaid: 100 })).toBe('partial');
  });

  it('considera o crédito do cliente como valor recebido', () => {
    expect(derivePaymentStatus({ price: 200, amountPaid: 120, clientCredit: 80 })).toBe('paid');
    expect(derivePaymentStatus({ price: 200, amountPaid: 50, clientCredit: 30 })).toBe('partial');
  });

  it('marca pago quando recebe acima do devido', () => {
    expect(derivePaymentStatus({ price: 100, amountPaid: 120 })).toBe('paid');
  });
});
