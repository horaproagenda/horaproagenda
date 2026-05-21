import { describe, it, expect } from 'vitest';
import { resolvePayment, generateBoletoInstallments } from './paymentScenarios';

describe('paymentScenarios — formas de pagamento (regressão completa)', () => {
  describe('Desconto', () => {
    it('serviço 150 com desconto 10 + pagamento 140 → PAGO sem restante', () => {
      const r = resolvePayment({
        basePrice: 150,
        discount: 10,
        payments: [{ method: 'pix', amount: 140 }],
      });
      expect(r.totalRequired).toBe(140);
      expect(r.totalPaid).toBe(140);
      expect(r.remaining).toBe(0);
      expect(r.status).toBe('paid');
    });

    it('desconto maior que o serviço não gera valor negativo', () => {
      const r = resolvePayment({ basePrice: 100, discount: 500, payments: [] });
      expect(r.totalRequired).toBe(0);
      expect(r.status).toBe('paid');
    });

    it('desconto parcial deixa restante coerente', () => {
      const r = resolvePayment({
        basePrice: 200,
        discount: 50,
        payments: [{ method: 'pix', amount: 100 }],
      });
      expect(r.totalRequired).toBe(150);
      expect(r.remaining).toBe(50);
      expect(r.status).toBe('partial');
    });
  });

  describe('Crédito ao cliente', () => {
    it('não afeta o caixa — cashAffectingAmount deve ser zero', () => {
      const r = resolvePayment({
        basePrice: 100,
        payments: [{ method: 'credito-cliente', amount: 100, isClientCredit: true }],
      });
      expect(r.cashAffectingAmount).toBe(0);
      expect(r.totalPaid).toBe(100);
      expect(r.status).toBe('paid');
    });

    it('clientCreditUsed conta como pago mas não vai pro caixa', () => {
      const r = resolvePayment({
        basePrice: 100,
        payments: [{ method: 'pix', amount: 40 }],
        clientCreditUsed: 60,
      });
      expect(r.totalPaid).toBe(100);
      expect(r.cashAffectingAmount).toBe(40);
      expect(r.status).toBe('paid');
    });
  });

  describe('Cartão com taxa', () => {
    it('soma a taxa deduzida do prestador', () => {
      const r = resolvePayment({
        basePrice: 200,
        payments: [{ method: 'credito', amount: 200, cardFee: 7.8, installments: 3 }],
      });
      expect(r.totalCardFees).toBeCloseTo(7.8, 2);
      expect(r.installmentCount).toBe(3);
      expect(r.status).toBe('paid');
    });
  });

  describe('Boleto parcelado', () => {
    it('gera N parcelas mensais com soma exata ao total', () => {
      const installments = generateBoletoInstallments(1000, 3, new Date('2026-01-10T12:00:00'));
      expect(installments).toHaveLength(3);
      const sum = installments.reduce((s, i) => s + i.amount, 0);
      expect(Number(sum.toFixed(2))).toBe(1000);
      expect(installments[1].dueDate.getMonth()).toBe(1); // fevereiro
      expect(installments[2].dueDate.getMonth()).toBe(2); // março
    });

    it('última parcela absorve resto de centavos', () => {
      const installments = generateBoletoInstallments(100, 3, new Date('2026-01-10T12:00:00'));
      const sum = installments.reduce((s, i) => s + i.amount, 0);
      expect(Number(sum.toFixed(2))).toBe(100);
    });

    it('suporta 24 parcelas (limite de boleto)', () => {
      const installments = generateBoletoInstallments(2400, 24, new Date('2026-01-10T12:00:00'));
      expect(installments).toHaveLength(24);
      const sum = installments.reduce((s, i) => s + i.amount, 0);
      expect(Number(sum.toFixed(2))).toBe(2400);
    });
  });

  describe('Pagamento misto', () => {
    it('PIX + crédito ao cliente + desconto quita o serviço', () => {
      const r = resolvePayment({
        basePrice: 300,
        discount: 30,
        payments: [
          { method: 'pix', amount: 170 },
          { method: 'credito-cliente', amount: 100, isClientCredit: true },
        ],
      });
      expect(r.totalRequired).toBe(270);
      expect(r.totalPaid).toBe(270);
      expect(r.cashAffectingAmount).toBe(170);
      expect(r.status).toBe('paid');
    });
  });

  describe('Pagamento parcial e acumulado', () => {
    it('pagamento incremental respeita o que já foi pago', () => {
      const r = resolvePayment({
        basePrice: 500,
        previouslyPaid: 200,
        payments: [{ method: 'dinheiro', amount: 300 }],
      });
      expect(r.totalPaid).toBe(500);
      expect(r.status).toBe('paid');
    });

    it('pagamento abaixo do total mantém status partial', () => {
      const r = resolvePayment({
        basePrice: 500,
        payments: [{ method: 'dinheiro', amount: 100 }],
      });
      expect(r.status).toBe('partial');
      expect(r.remaining).toBe(400);
    });

    it('sem pagamento permanece pending', () => {
      const r = resolvePayment({ basePrice: 100, payments: [] });
      expect(r.status).toBe('pending');
    });
  });

  describe('Itens adicionais', () => {
    it('soma itens adicionais ao total exigido', () => {
      const r = resolvePayment({
        basePrice: 100,
        additionalItemsTotal: 50,
        payments: [{ method: 'pix', amount: 150 }],
      });
      expect(r.totalRequired).toBe(150);
      expect(r.status).toBe('paid');
    });
  });
});
