import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { humanizeError } from '@/lib/humanError';


export interface ProductDailyConsumption {
  id: string;
  product_id: string;
  consumption_date: string;
  quantity_used: number;
  unit: string;
  professional_id: string | null;
  service_id: string | null;
  appointment_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
}

export function useProductDailyConsumption(productId?: string) {
  const queryClient = useQueryClient();
  const requestRef = useRef<{ payload: string; id: string } | null>(null);
  const invalidate = () => Promise.all(['product_daily_consumption', 'products', 'product_usage_events', 'product_usage_records', 'products-for-prediction'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));

  const { data: consumptions = [], isLoading, refetch } = useQuery({
    queryKey: ['product_daily_consumption', productId],
    queryFn: async () => {
      let query = supabase
        .from('product_daily_consumption')
        .select('*')
        .is('cancelled_at', null)
        .order('consumption_date', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ProductDailyConsumption[];
    },
  });

  // Atualização em tempo real: baixas de ciclo, vendas e lançamentos manuais
  // aparecem nos cartões de período sem recarregar a página.
  useEffect(() => {
    const ch = supabase
      .channel(`product-daily-consumption-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_daily_consumption' }, () => {
        queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_usage_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
        queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const createConsumption = useMutation({
    mutationFn: async (consumption: {
      product_id: string;
      consumption_date: string;
      quantity_used: number;
      unit: string;
      professional_id?: string | null;
      service_id?: string | null;
      appointment_id?: string | null;
      notes?: string | null;
    }) => {
      const payload = JSON.stringify(consumption);
      if (requestRef.current?.payload !== payload) requestRef.current = { payload, id: crypto.randomUUID() };
      const request = requestRef.current;
      if (!request) throw new Error('Não foi possível preparar o consumo.');
      const { data, error } = await supabase.rpc('record_manual_product_consumption', {
        _input: JSON.parse(payload), _request_id: request.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      requestRef.current = null;
      void invalidate();
      toast.success('Consumo registrado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar consumo: ' + error.message);
    },
  });

  const deleteConsumption = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('cancel_manual_product_consumption', {
        _id: input.id, _reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void invalidate();
      toast.success('Consumo cancelado e estoque restaurado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover consumo: ' + error.message);
    },
  });

  // Stats
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  const semesterStart = format(subMonths(today, 6), 'yyyy-MM-dd');
  const yearStart = format(new Date(today.getFullYear(), 0, 1), 'yyyy-MM-dd');

  const stats = {
    today: consumptions.filter(c => c.consumption_date === todayStr).reduce((sum, c) => sum + c.quantity_used, 0),
    week: consumptions.filter(c => c.consumption_date >= weekStart && c.consumption_date <= weekEnd).reduce((sum, c) => sum + c.quantity_used, 0),
    month: consumptions.filter(c => c.consumption_date >= monthStart && c.consumption_date <= monthEnd).reduce((sum, c) => sum + c.quantity_used, 0),
    semester: consumptions.filter(c => c.consumption_date >= semesterStart).reduce((sum, c) => sum + c.quantity_used, 0),
    year: consumptions.filter(c => c.consumption_date >= yearStart).reduce((sum, c) => sum + c.quantity_used, 0),
  };

  return {
    consumptions,
    isLoading,
    refetch,
    createConsumption,
    deleteConsumption,

    stats,
  };
}
