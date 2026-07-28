export type PaymentStatusValue = 'pending' | 'partial' | 'paid';

export interface DerivePaymentStatusInput {
  /** Valor cheio do serviço/pacote. */
  price: number;
  /** Desconto concedido. */
  discount?: number;
  /** Valor efetivamente recebido (dinheiro, cartão, pix, crédito do cliente...). */
  amountPaid: number;
  /** Crédito do cliente aplicado, quando informado separadamente. */
  clientCredit?: number;
}

/**
 * Regra única de derivação do status de pagamento.
 *
 * Um atendimento só fica "paid" quando o valor recebido cobre o valor devido
 * (preço menos desconto). Nunca é pago apenas por existir uma venda parecida
 * ou por ter algum valor lançado.
 */
export function derivePaymentStatus({
  price,
  discount = 0,
  amountPaid,
  clientCredit = 0,
}: DerivePaymentStatusInput): PaymentStatusValue {
  const due = Math.max(0, Number(price || 0) - Number(discount || 0));
  const received = Number(amountPaid || 0) + Number(clientCredit || 0);

  if (received <= 0) return due === 0 ? 'pending' : 'pending';
  if (due > 0 && received + 0.001 < due) return 'partial';
  return 'paid';
}
