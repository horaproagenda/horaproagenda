import { supabase } from '@/integrations/supabase/client';

/**
 * ÚNICA forma de alterar o estoque de um produto pelo app.
 * Soma (delta > 0) ou retira (delta < 0) de forma atômica no banco, sem
 * ler-e-regravar — duas telas ao mesmo tempo não se sobrescrevem.
 */
export async function adjustProductStock(productId: string, delta: number): Promise<number> {
  const { data, error } = await (supabase as any).rpc('adjust_product_stock', {
    p_product_id: productId,
    p_delta: delta,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Define o estoque para um valor exato (inventário manual) usando o mesmo caminho. */
export async function setProductStock(productId: string, currentStock: number, target: number): Promise<number> {
  return adjustProductStock(productId, Number(target) - Number(currentStock || 0));
}
