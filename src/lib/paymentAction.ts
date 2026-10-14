export type PaymentActionKind = 'package_pay' | 'package_paid' | 'single_pay' | 'none';

export interface PaymentActionInput {
  /** Agendamento pertence a pacote (vínculo de sessão ou pacote resolvido). */
  isPackage: boolean;
  packageTotal: number;
  /** Recebido no pacote inteiro (não o preço da etapa). */
  packagePaid: number;
  /** Sinal explícito de pacote quitado (status pago / venda paga). */
  packageMarkedPaid?: boolean;
  servicePrice: number;
  extras?: number;
  discount?: number;
  amountPaid: number;
}

export interface PaymentAction { kind: PaymentActionKind; balance: number; label: string }

const EPS = 0.009;

/**
 * Regra única: decide primeiro pelo pacote; o preço individual da etapa
 * (ex.: avaliação R$ 0) nunca esconde a baixa de um pacote com saldo.
 */
export function getPaymentAction(i: PaymentActionInput): PaymentAction {
  const extras = i.extras ?? 0;
  const discount = i.discount ?? 0;
  if (i.isPackage) {
    const due = Math.max(0, i.packageTotal + extras - discount);
    const balance = i.packageMarkedPaid ? Math.max(0, extras - Math.max(0, i.packagePaid - i.packageTotal)) : Math.max(0, due - i.packagePaid);
    if (balance > EPS) return { kind: 'package_pay', balance, label: 'Dar baixa no pacote' };
    return { kind: 'package_paid', balance: 0, label: 'Pacote pago' };
  }
  const balance = Math.max(0, i.servicePrice + extras - discount - i.amountPaid);
  if (balance > EPS) return { kind: 'single_pay', balance, label: 'Dar baixa no pagamento' };
  return { kind: 'none', balance: 0, label: '' };
}

/** Limita um novo recebimento ao saldo, impedindo baixa em duplicidade. */
export function clampPaymentToBalance(amount: number, action: PaymentAction): number {
  return Math.max(0, Math.min(amount, action.balance));
}
