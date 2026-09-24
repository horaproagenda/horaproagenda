import { supabase } from '@/integrations/supabase/client';

/**
 * ÚNICO ponto que decide para onde vai um lançamento financeiro.
 * Lê o vínculo do profissional (independente, comissionado, funcionário…):
 * - independente → conta financeira e caixa PRÓPRIOS do profissional;
 * - demais vínculos (ou sem profissional) → conta e caixa da clínica.
 * Toda venda, pagamento, devolução ou baixa de produto deve usar esta função.
 */
export interface FinancialDestination {
  employmentType: string | null;
  /** Profissional dono do caixa/conta (null = clínica). */
  professionalId: string | null;
  financialAccountId: string | null;
  /** Caixa aberto correspondente (null = nenhum aberto). */
  cashRegisterId: string | null;
}

export async function resolveFinancialDestination(
  professionalId?: string | null,
): Promise<FinancialDestination> {
  const { data, error } = await (supabase as any).rpc('resolve_financial_destination', {
    p_professional_id: professionalId ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    employmentType: row?.employment_type ?? null,
    professionalId: row?.professional_id ?? null,
    financialAccountId: row?.financial_account_id ?? null,
    cashRegisterId: row?.cash_register_id ?? null,
  };
}

/** Mesmo destino, a partir do pacote vendido (usa o profissional do pacote). */
export async function resolveFinancialDestinationForPackage(packageId?: string | null) {
  let professionalId: string | null = null;
  if (packageId) {
    const { data } = await supabase
      .from('service_packages')
      .select('professional_id')
      .eq('id', packageId)
      .maybeSingle();
    professionalId = (data as any)?.professional_id ?? null;
  }
  return resolveFinancialDestination(professionalId);
}
