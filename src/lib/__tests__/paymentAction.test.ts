import { describe, it, expect } from 'vitest';
import { getPaymentAction, clampPaymentToBalance } from '../paymentAction';

const pkg = { isPackage: true, packageTotal: 1500, servicePrice: 0, amountPaid: 0 };

describe('ação de pagamento', () => {
  it('avaliação avulsa R$ 0 não mostra baixa', () => {
    expect(getPaymentAction({ isPackage: false, packageTotal: 0, packagePaid: 0, servicePrice: 0, amountPaid: 0 }).kind).toBe('none');
  });
  it('avaliação em pacote pendente mostra "Dar baixa no pacote"', () => {
    const a = getPaymentAction({ ...pkg, packagePaid: 0 });
    expect(a.label).toBe('Dar baixa no pacote');
    expect(a.balance).toBe(1500);
  });
  it('avaliação em pacote pago mostra "Pacote pago"', () => {
    expect(getPaymentAction({ ...pkg, packagePaid: 1500 }).label).toBe('Pacote pago');
    expect(getPaymentAction({ ...pkg, packagePaid: 0, packageMarkedPaid: true }).kind).toBe('package_paid');
  });
  it('pacote parcial mostra saldo restante', () => {
    expect(getPaymentAction({ ...pkg, packagePaid: 1000 }).balance).toBe(500);
  });
  it('serviço avulso com valor mostra baixa individual', () => {
    const a = getPaymentAction({ isPackage: false, packageTotal: 0, packagePaid: 0, servicePrice: 200, amountPaid: 0 });
    expect(a.label).toBe('Dar baixa no pagamento');
  });
  it('segunda baixa não ultrapassa o saldo', () => {
    const after = getPaymentAction({ ...pkg, packagePaid: 1500 });
    expect(clampPaymentToBalance(1500, after)).toBe(0);
  });
});
