/**
 * Comissão definida na etapa do kit ou do pacote sequencial, congelada no
 * atendimento (commission_type_snapshot/commission_value_snapshot).
 * Tem prioridade sobre a comissão por serviço e a padrão do profissional.
 * Retorna null quando a etapa usa o padrão do profissional.
 */
export function stepCommissionAmount(
  apt: { commission_type_snapshot?: string | null; commission_value_snapshot?: number | string | null } | null | undefined,
  amount: number,
): number | null {
  if (!apt) return null;
  const value = Number(apt.commission_value_snapshot) || 0;
  if (apt.commission_type_snapshot === 'fixed') return value;
  if (apt.commission_type_snapshot === 'percentage') return (amount * value) / 100;
  return null;
}
