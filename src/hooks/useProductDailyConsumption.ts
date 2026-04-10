import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';

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
      const { error } = await supabase
        .from('product_daily_consumption')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_daily_consumption'] });
      toast.success('Consumo removido!');
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
