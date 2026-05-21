/**
 * Pure helpers centralizando as regras de pagamento usadas pela Agenda e pelo
 * backend (process-payment). Permite cobertura por testes unitários e garante
 * que cada forma de pagamento se comporte como esperado em todo o app.
 */

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface PaymentMethodInput {
  /** id ou nome da forma de pagamento */
  method: string;
  amount: number;
  /** true para crédito ao cliente — não entra no caixa nem no financeiro */
  isClientCredit?: boolean;
  /** taxa do cartão deduzida do prestador (já calculada) */
  cardFee?: number;
  /** número de parcelas (para boleto/cartão) */
  installments?: number;
}

export interface ResolvePaymentParams {
  basePrice: number;
  additionalItemsTotal?: number;
  discount?: number;
  previouslyPaid?: number;
  payments: PaymentMethodInput[];
  /** crédito ao cliente já usado nesta transação */
  clientCreditUsed?: number;
}

export interface ResolvedPayment {
  /** preço efetivo cobrado (após desconto e itens adicionais) */
  totalRequired: number;
  /** total acumulado pago (anterior + atual) */
  totalPaid: number;
  /** valor que efetivamente entra no caixa (exclui crédito ao cliente) */
  cashAffectingAmount: number;
  remaining: number;
  status: PaymentStatus;
  /** parcelas (boleto/cartão), >= 1 */
  installmentCount: number;
  /** soma das taxas de cartão deduzidas do prestador */
  totalCardFees: number;
}

export function resolvePayment(p: ResolvePaymentParams): ResolvedPayment {
  const additional = Math.max(0, p.additionalItemsTotal || 0);
  const discount = Math.max(0, p.discount || 0);
  const previouslyPaid = Math.max(0, p.previouslyPaid || 0);
  const creditUsed = Math.max(0, p.clientCreditUsed || 0);

  const totalRequired = Math.max(0, p.basePrice + additional - discount);

  let cashAffectingAmount = 0;
  let totalCardFees = 0;
  let installmentCount = 1;
  let methodsAmount = 0;

  for (const m of p.payments) {
    const amt = Math.max(0, Number(m.amount) || 0);
    methodsAmount += amt;
    if (!m.isClientCredit) cashAffectingAmount += amt;
    if (m.cardFee && m.cardFee > 0) totalCardFees += m.cardFee;
    if (m.installments && m.installments > installmentCount) {
      installmentCount = m.installments;
    }
  }

  const totalPaid = previouslyPaid + methodsAmount + creditUsed;
  const remaining = Math.max(0, totalRequired - totalPaid);

  let status: PaymentStatus = 'pending';
  if (totalRequired <= 0 || totalPaid >= totalRequired) status = 'paid';
  else if (totalPaid > 0) status = 'partial';

  return {
    totalRequired,
    totalPaid,
    cashAffectingAmount,
    remaining,
    status,
    installmentCount,
    totalCardFees,
  };
}

/** Gera o cronograma de parcelas de boleto (datas e valores). */
export interface BoletoInstallment {
  number: number;
  amount: number;
  dueDate: Date;
}

export function generateBoletoInstallments(
  totalAmount: number,
  installmentCount: number,
  firstDueDate: Date,
  intervalDays = 30,
): BoletoInstallment[] {
  if (installmentCount < 1) throw new Error('installmentCount must be >= 1');
  const baseAmount = Math.floor((totalAmount * 100) / installmentCount) / 100;
  const result: BoletoInstallment[] = [];
  let accumulated = 0;
  for (let i = 0; i < installmentCount; i++) {
    const isLast = i === installmentCount - 1;
    const amount = isLast ? Number((totalAmount - accumulated).toFixed(2)) : baseAmount;
    accumulated += amount;
    const due = new Date(firstDueDate);
    due.setDate(due.getDate() + intervalDays * i);
    result.push({ number: i + 1, amount, dueDate: due });
  }
  return result;
}
