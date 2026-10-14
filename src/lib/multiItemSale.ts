import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export async function submitMultiItemSale(input: Record<string, unknown>, requestId: string) {
  const { data, error } = await supabase.rpc('create_multi_item_sale_atomic', { _input: JSON.parse(JSON.stringify(input)) as Json, _request_id: requestId });
  if (error) throw error;
  return data;
}