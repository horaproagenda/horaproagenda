import { supabase } from '@/integrations/supabase/client';

export async function submitMultiItemSale(input: Record<string, unknown>, requestId: string) {
  const { data, error } = await supabase.rpc('create_multi_item_sale_atomic', { _input: input, _request_id: requestId });
  if (error) throw error;
  return data;
}