/** Normaliza um telefone brasileiro para o formato usado pelo WhatsApp (5511999999999). */
export function normalizeBrPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return digits;
}
