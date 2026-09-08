import { describe, it, expect } from 'vitest';
import { computePackageReceivedAmount } from '../packageReceivedAmount';

describe('valor recebido de pacotes', () => {
  it('não conta boleto sem baixa', () => {
    expect(
      computePackageReceivedAmount({ boletoCount: 2, boletoPaidAmount: 0, paidAt: null, finalAmount: 300 }),
    ).toBe(0);
  });

  it('conta apenas as parcelas pagas', () => {
    expect(
      computePackageReceivedAmount({ boletoCount: 2, boletoPaidAmount: 150, paidAt: null, finalAmount: 300 }),
    ).toBe(150);
  });

  it('venda paga fora de boleto usa o valor final', () => {
    expect(
      computePackageReceivedAmount({ boletoCount: 0, boletoPaidAmount: 0, paidAt: '2026-09-08', finalAmount: 300 }),
    ).toBe(300);
  });

  it('venda sem pagamento fica zerada', () => {
    expect(
      computePackageReceivedAmount({ boletoCount: 0, boletoPaidAmount: 0, paidAt: null, finalAmount: 300 }),
    ).toBe(0);
  });
});
