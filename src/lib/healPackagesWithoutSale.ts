import { supabase } from '@/integrations/supabase/client';

export interface HealPackagesResult {
  ok?: boolean;
  created_sales?: number;
  package_ids?: string[];
}

type RpcCaller = (fn: string) => Promise<{ data: HealPackagesResult | null; error: { message: string } | null }>;

/**
 * REGRESSÃO PROTEGIDA: pacotes criados pela agenda não têm venda no Caixa.
 * Esta rotina apenas REGULARIZA (cria o registro de venda pendente) — nunca apaga
 * pacotes nem sessões.
 */
export async function healPackagesWithoutSale(): Promise<HealPackagesResult> {
  const rpc = supabase.rpc as unknown as RpcCaller;
  const { data, error } = await rpc('heal_packages_without_sale');
  if (error) throw new Error(error.message);
  return data ?? {};
}
