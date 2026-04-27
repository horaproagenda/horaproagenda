import { toast } from 'sonner';

export const CLIENT_CREDIT_PAYMENT_LABEL = 'Crédito ao cliente (sem entrada no caixa)';

export function isClientCreditPaymentMethod(methodName?: string | null): boolean {
  const normalized = (methodName || '').toLowerCase();
  return normalized.includes('crédito ao cliente') || normalized.includes('credito ao cliente');
}

export function getClientCreditPaymentLimit(availableBalance: number, remainingAmount: number): number {
  return Math.max(0, Math.min(Number(availableBalance) || 0, Number(remainingAmount) || 0));
}

export function validateClientCreditPayment(amount: number, availableBalance: number, remainingAmount: number): string | null {
  const numericAmount = Number(amount) || 0;
  const numericBalance = Number(availableBalance) || 0;
  const numericRemaining = Number(remainingAmount) || 0;

  if (numericAmount > numericBalance) {
    return `Crédito ao cliente limitado ao saldo disponível de R$ ${numericBalance.toFixed(2)}.`;
  }

  if (numericAmount > numericRemaining) {
    return `Crédito ao cliente limitado ao restante a pagar de R$ ${numericRemaining.toFixed(2)}.`;
  }

  return null;
}

export function showClientCreditValidationToast(message: string | null): boolean {
  if (!message) return false;
  toast.error(message);
  return true;
}