import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { UsageCalcMode } from '@/lib/productUsageCalc';

export interface ProductUsageRecord {
  id: string;
  product_id: string;
  service_id: string | null;
  package_template_id: string | null;
  calc_mode: UsageCalcMode;
  container_amount: number;
  container_unit: string;
  quantity_per_appointment: number | null;
  avg_quantity_per_appointment: number | null;
  start_date: string;
  end_date: string;
  appointments_counted: number;
  appointment_ids: string[];
  total_consumed: number | null;
  container_yield: number | null;
  cycle_key: string | null;
  stock_after: number | null;
  created_at: string;
  updated_at: string;
}

export type NewProductUsageRecord = Omit<ProductUsageRecord, 'id' | 'created_at' | 'updated_at'>;

/**
 * Histórico de frascos em uso. Cada frasco gera um NOVO registro — nada é
 * sobrescrito — e os atendimentos já contados em um registro não podem ser
 * reaproveitados em outro.
 */
export function useProductUsageRecords(productId?: string) {
  const queryClient = useQueryClient();

  const { data: usageRecords = [], isLoading, refetch } = useQuery({
    queryKey: ['product_usage_records', productId ?? 'all'],
    queryFn: async () => {
      let query = supabase.from('product_usage_records')
        .select('*')
        .order('start_date', { ascending: false });
      if (productId) query = query.eq('product_id', productId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProductUsageRecord[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`product-usage-records-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_usage_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const createUsageRecord = useMutation({
    mutationFn: async (record: NewProductUsageRecord) => {
      const { data, error } = await supabase.from('product_usage_records')
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      return data as ProductUsageRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['service_products'] });
      queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
    },
    onError: (error: unknown) => {
      toast.error(error);
    },
  });

  const invalidateCycleQueries = () => {
    ['products', 'product_purchases', 'product_usage_records', 'product_daily_consumption', 'products-for-prediction', 'product-cycle-history'].forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  };

  const startCycle = useMutation({
    mutationFn: async (input: { productId: string; purchaseId?: string | null; startDate: string; quantity: number; unit: string }) => {
      const { data, error } = await supabase.rpc('start_product_usage_cycle', {
        _product_id: input.productId,
        _purchase_id: input.purchaseId ?? undefined,
        _start_date: input.startDate,
        _quantity: input.quantity,
        _unit: input.unit,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => toast.error(error),
  });

  const finishCycle = useMutation({
    mutationFn: async (input: { productId: string; purchaseId: string; endDate: string; unit: string; appointments: Array<{ id: string; date: string; serviceId?: string | null }> }) => {
      const { data, error } = await supabase.rpc('finish_product_usage_cycle', {
        _product_id: input.productId,
        _purchase_id: input.purchaseId,
        _end_date: input.endDate,
        _unit: input.unit,
        _appointment_ids: input.appointments.map((item) => item.id),
        _appointment_dates: input.appointments.map((item) => item.date),
        _service_ids: input.appointments.map((item) => item.serviceId ?? null) as unknown as string[],
      });
      if (error) throw error;
      return data as { stock_after?: number; quantity?: number; appointments?: number; average_per_appointment?: number | null; duration_days?: number; already_finished?: boolean } | null;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => toast.error(error),
  });

  const deleteUsageRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_usage_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
      toast.success('Registro de uso removido.');
    },
    onError: (error: unknown) => {
      toast.error(error);
    },
  });

  /** IDs de atendimentos já contabilizados em outros frascos do mesmo produto. */
  const usedAppointmentIds = (targetProductId?: string) =>
    usageRecords
      .filter((r) => !targetProductId || r.product_id === targetProductId)
      .flatMap((r) => r.appointment_ids ?? []);

  return { usageRecords, isLoading, refetch, createUsageRecord, deleteUsageRecord, startCycle, finishCycle, usedAppointmentIds };
}
