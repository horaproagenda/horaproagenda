import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { getClientCreditPaymentLimit, isClientCreditPaymentMethod, showClientCreditValidationToast, validateClientCreditPayment } from './clientCreditPayment';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('clientCreditPayment', () => {
  it('impede confirmar crédito ao cliente acima do saldo disponível', () => {
    expect(validateClientCreditPayment(150, 100, 200)).toBe('Crédito ao cliente limitado ao saldo disponível de R$ 100.00.');
  });

  it('impede confirmar crédito ao cliente acima do restante a pagar', () => {
    expect(validateClientCreditPayment(120, 200, 80)).toBe('Crédito ao cliente limitado ao restante a pagar de R$ 80.00.');
  });

  it('aceita crédito dentro do saldo e do restante a pagar', () => {
    expect(validateClientCreditPayment(80, 100, 90)).toBeNull();
    expect(getClientCreditPaymentLimit(100, 90)).toBe(90);
  });

  it('reconhece crédito ao cliente com e sem acento', () => {
    expect(isClientCreditPaymentMethod('Crédito ao Cliente')).toBe(true);
    expect(isClientCreditPaymentMethod('Credito ao Cliente')).toBe(true);
    expect(isClientCreditPaymentMethod('Cartão de Crédito')).toBe(false);
  });

  it('exibe toast de erro correspondente quando a validação falha', () => {
    const message = validateClientCreditPayment(150, 100, 200);

    expect(showClientCreditValidationToast(message)).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('Crédito ao cliente limitado ao saldo disponível de R$ 100.00.');
  });
});