import { describe, it, expect } from 'vitest';
import { derivePaymentStatus } from '../paymentStatus';
import { resolvePayment } from '../paymentScenarios';
import { computePackageReceivedAmount } from '../packageReceivedAmount';

/**
 * Regressão: desconto em pacote não pode gerar saldo em aberto, status parcial
 * nem saída no caixa. Se estas regras forem desfeitas, estes testes falham.
 */
describe('desconto em pacote', () => {
  it('pacote de 900 com desconto 150 e recebimento de 750 fica pago', () => {
    expect(derivePaymentStatus({ price: 900, discount: 150, amountPaid: 750 })).toBe('paid');
  });

  it('desconto não deixa restante em aberto', () => {
    const r = resolvePayment({
      basePrice: 900,
      discount: 150,
      payments: [{ method: 'pix', amount: 750 }],
    });
    expect(r.totalRequired).toBe(750);
    expect(r.remaining).toBe(0);
    expect(r.status).toBe('paid');
  });

  it('desconto não entra no valor que vai para o caixa', () => {
    const r = resolvePayment({
      basePrice: 300,
      discount: 150,
      payments: [{ method: 'dinheiro', amount: 150 }],
    });
    expect(r.cashAffectingAmount).toBe(150);
    expect(r.status).toBe('paid');
  });

  it('recebido do pacote só conta parcelas com baixa', () => {
    expect(
      computePackageReceivedAmount({ boletoCount: 2, boletoPaidAmount: 0, paidAt: null, finalAmount: 300 })
    ).toBe(0);
    expect(
      computePackageReceivedAmount({ boletoCount: 2, boletoPaidAmount: 150, paidAt: null, finalAmount: 300 })
    ).toBe(150);
  });
});
