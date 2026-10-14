import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanError';
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
  start_date: string | null;
  end_date: string | null;
  purchase_id: string | null;
  status: 'planned' | 'in_use' | 'completed' | 'cancelled';
  version: number;
  duration_days: number | null;
  stock_quantity: number | null;
  cancellation_reason: string | null;
  appointments_counted: number;
  appointment_ids: string[];
  total_consumed: number | null;
  container_yield: number | null;
  cycle_key: string | null;
  stock_after: number | null;
  created_at: string;
  updated_at: string;
}

export type NewProductUsageRecord = Pick<ProductUsageRecord, 'product_id' | 'container_amount' | 'container_unit' | 'start_date' | 'end_date'>;

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
      if (!record.start_date || !record.end_date) throw new Error('Informe início e término.');
      const { data, error } = await supabase.rpc('record_completed_product_usage', {
        _product_id: record.product_id, _quantity: record.container_amount, _unit: record.container_unit,
        _start_date: record.start_date, _end_date: record.end_date,
      });
      if (error) throw error;
      return data as unknown as ProductUsageRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_usage_records'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['service_products'] });
      queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
    },
    onError: (error: unknown) => {
      toast.error(humanizeError(error));
    },
  });

  const invalidateCycleQueries = async () => {
    await Promise.all(['products', 'product_purchases', 'product_usage_records', 'product_daily_consumption', 'products-for-prediction', 'product-cycle-history', 'product-active-cycles', 'product_usage_events'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ));
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
      return data as unknown as ProductUsageRecord;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => toast.error(humanizeError(error)),
  });

  const finishCycle = useMutation({
    mutationFn: async (input: { usageId: string; version: number; endDate: string }) => {
      const { data, error } = await supabase.rpc('finish_product_usage_record', {
        _usage_id: input.usageId,
        _expected_version: input.version,
        _end_date: input.endDate,
      });
      if (error) throw error;
      return data as { stock_after?: number; quantity?: number; appointments?: number; average_per_appointment?: number | null; duration_days?: number; already_finished?: boolean } | null;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => toast.error(humanizeError(error)),
  });

  const changeCycle = useMutation({
    mutationFn: async (input: { usageId: string; version: number; startDate: string | null; endDate: string | null; reason: string; action: 'correct' | 'reopen' | 'cancel' }) => {
      const { data, error } = await supabase.rpc('change_product_usage_record', {
        _usage_id: input.usageId, _expected_version: input.version, _start_date: input.startDate as string,
        _end_date: input.endDate as string, _reason: input.reason, _action: input.action,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => toast.error(humanizeError(error)),
  });

  const adjustStock = useMutation({
    mutationFn: async (input: { productId: string; expectedStock: number; newStock: number; reason: string }) => {
      const { data, error } = await supabase.rpc('adjust_product_stock_audited', {
        _product_id: input.productId, _expected_stock: input.expectedStock, _new_stock: input.newStock, _reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateCycleQueries,
    onError: (error: unknown) => {
      toast.error(humanizeError(error));
    },
  });

  /** IDs de atendimentos já contabilizados em outros frascos do mesmo produto. */
  const usedAppointmentIds = (targetProductId?: string) =>
    usageRecords
      .filter((r) => r.status === 'completed' && (!targetProductId || r.product_id === targetProductId))
      .flatMap((r) => r.appointment_ids ?? []);

  return { usageRecords, isLoading, refetch, createUsageRecord, changeCycle, adjustStock, startCycle, finishCycle, usedAppointmentIds };
}
