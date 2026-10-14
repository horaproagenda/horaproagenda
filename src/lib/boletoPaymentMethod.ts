/** Parcela de venda por boleto: a forma de pagamento é sempre "Boleto", nunca outra. */
export interface PaymentMethodLike { id: string; name: string }
export function isBoletoMethod(m?: PaymentMethodLike | null): boolean {
  return !!m && /boleto/i.test(m.name);
}
export function resolveBoletoPaymentMethod(
  isBoletoSale: boolean,
  informed: PaymentMethodLike | null,
  boleto: PaymentMethodLike | null,
): PaymentMethodLike | null {
  if (!isBoletoSale) return informed;
  return isBoletoMethod(informed) ? informed : boleto;
}
