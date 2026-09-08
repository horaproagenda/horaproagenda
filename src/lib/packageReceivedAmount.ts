/**
 * Valor efetivamente recebido de uma venda de pacote.
 *
 * Regra protegida: boleto parcelado só soma o que teve baixa. Uma venda com
 * duas parcelas de 150 sem baixa vale R$ 0,00 recebido — nunca R$ 300,00.
 */
export interface ReceivedAmountInput {
  /** Quantidade de parcelas de boleto vinculadas à venda. */
  boletoCount: number;
  /** Soma das parcelas com baixa (status pago). */
  boletoPaidAmount: number;
  /** Data/hora do pagamento da venda (quando não é boleto). */
  paidAt?: string | null;
  /** Valor final da venda. */
  finalAmount: number;
}

export function computePackageReceivedAmount(input: ReceivedAmountInput): number {
  const { boletoCount, boletoPaidAmount, paidAt, finalAmount } = input;
  if (boletoCount > 0) {
    return Number(Math.max(0, boletoPaidAmount).toFixed(2));
  }
  return paidAt ? Number(Math.max(0, finalAmount).toFixed(2)) : 0;
}
