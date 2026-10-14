/** Regra: nenhum recebimento pode ser marcado como pago sem forma de pagamento. */
export function requirePaymentMethod(status: string | null | undefined, paymentMethodId: string | null | undefined): string | null {
  if (status !== 'paid') return null;
  return paymentMethodId ? null : 'Escolha a forma de pagamento antes de confirmar o recebimento.';
}
