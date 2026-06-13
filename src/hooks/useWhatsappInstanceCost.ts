import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsappInstanceCost {
  qty: number;
  unitUsd: number;
  rate: number;
  unitBrl: number;
  totalBrl: number;
}

/**
 * Returns the WhatsApp instance cost (in BRL) for N professionals,
 * applying the active volume-pricing tier and the configured USD→BRL rate.
 */
export function useWhatsappInstanceCost(qty: number) {
  return useQuery<WhatsappInstanceCost>({
    queryKey: ['whatsapp-instance-cost', qty],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_whatsapp_instance_cost_brl', {
        qty,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        qty: Number(row?.qty_out ?? qty),
        unitUsd: Number(row?.unit_usd ?? 0),
        rate: Number(row?.rate ?? 0),
        unitBrl: Number(row?.unit_brl ?? 0),
        totalBrl: Number(row?.total_brl ?? 0),
      };
    },
    staleTime: 60_000,
    enabled: qty > 0,
  });
}
