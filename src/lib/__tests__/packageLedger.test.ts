import { describe, it, expect } from 'vitest';
import { resolvePackagePayment, paidPackageSaleIds } from '../packageLedger';

const base = { salePaid: 0, hasBoleto: false, sessionPaid: 3800, finalAmount: 3800, salePaymentMethodName: null, saleDate: '2026-08-27' };

describe('pagamento de pacote pelo livro financeiro', () => {
  it('baixa feita pela agenda aparece com data e forma do lançamento', () => {
    const r = resolvePackagePayment({ ...base, ledger: [{ amount: 3800, paidDate: '2026-09-26', methodName: 'Cartão de Crédito' }] });
    expect(r.paidAmount).toBe(3800);
    expect(r.paymentMethodName).toBe('Cartão de Crédito');
    expect(r.paymentDate).toBe('2026-09-26');
    expect(r.ledgerMissing).toBe(false);
  });
  it('valor pago nas sessões sem lançamento não conta como pago e gera alerta', () => {
    const r = resolvePackagePayment({ ...base, ledger: [] });
    expect(r.paidAmount).toBe(0);
    expect(r.ledgerMissing).toBe(true);
  });
  it('venda de pacote sem pagamento não esconde o pagamento feito pela agenda', () => {
    const ids = paidPackageSaleIds([{ package_id: 'p1', paid_at: null, final_amount: 3800, notes: 'Registro criado automaticamente' }]);
    expect(ids.has('p1')).toBe(false);
  });
  it('venda de pacote paga continua sendo a fonte do pagamento', () => {
    expect(paidPackageSaleIds([{ package_id: 'p1', paid_at: '2026-09-26', final_amount: 3800 }]).has('p1')).toBe(true);
  });
});
