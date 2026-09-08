import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cycleConsumptionTag, type CycleConsumptionEntry } from '@/lib/productCycleConsumption';


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
}

export function useProductDailyConsumption(productId?: string) {
  const queryClient = useQueryClient();

  const { data: consumptions = [], isLoading, refetch } = useQuery({
    queryKey: ['product_daily_consumption', productId],
    queryFn: async () => {
      let query = supabase
        .from('product_daily_consumption')
        .select('*')
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

  /**
   * Grava (ou regrava) os lançamentos de consumo de um ciclo encerrado.
   * NÃO altera o estoque: o abatimento do ciclo é feito uma única vez pelo
   * próprio encerramento. Regravar substitui os lançamentos daquele ciclo,
   * então encerrar duas vezes nunca soma consumo em dobro.
   */
  const replaceCycleConsumption = useMutation({
    mutationFn: async (params: {
      product_id: string;
      cycle_key: string;
      unit: string;
      entries: CycleConsumptionEntry[];
      professional_id?: string | null;
    }) => {
      const tag = cycleConsumptionTag(params.cycle_key);
      const { data: { user } } = await supabase.auth.getUser();

      const { error: delError } = await supabase
        .from('product_daily_consumption')
        .delete()
        .eq('product_id', params.product_id)
        .like('notes', `%${tag}%`);
      if (delError) throw delError;

      if (params.entries.length === 0) return;

      const rows = params.entries.map((e) => ({
        product_id: params.product_id,
        consumption_date: e.consumption_date,
        quantity_used: e.quantity_used,
        unit: params.unit,
        appointment_id: e.appointment_id,
        service_id: e.service_id,
        professional_id: params.professional_id ?? null,
        notes: `Consumo do ciclo de uso ${tag}`,
        created_by: user?.id ?? null,
      }));

      const { error } = await supabase.from('product_daily_consumption').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
    },
  });



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
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('product_daily_consumption')
        .insert({ ...consumption, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;

      // Deduct from product stock
      const { data: product } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', consumption.product_id)
        .single();

      if (product) {
        await supabase
          .from('products')
          .update({ current_stock: Math.max(0, product.current_stock - consumption.quantity_used) })
          .eq('id', consumption.product_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Consumo registrado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar consumo: ' + error.message);
    },
  });

  const deleteConsumption = useMutation({
    mutationFn: async (id: string) => {
      // Busca o registro para devolver a quantidade ao estoque antes de excluir
      const { data: row, error: fetchErr } = await supabase
        .from('product_daily_consumption')
        .select('product_id, quantity_used')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await supabase
        .from('product_daily_consumption')
        .delete()
        .eq('id', id);
      if (error) throw error;

      if (row) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', row.product_id)
          .single();
        if (product) {
          await supabase
            .from('products')
            .update({ current_stock: Number(product.current_stock || 0) + Number(row.quantity_used || 0) })
            .eq('id', row.product_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Consumo removido e estoque restaurado!');
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
