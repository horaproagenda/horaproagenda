import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval, format } from 'date-fns';

export interface AppointmentProductConsumption {
  id: string;
  appointment_id: string;
  product_id: string;
  quantity_used: number;
  source_type: 'service' | 'package_template';
  source_id: string;
  created_at: string;
}

export interface ProductConsumptionReport {
  product_id: string;
  product_name: string;
  product_unit: string;
  total_quantity: number;
  appointment_count: number;
  avg_per_appointment: number;
  by_source: {
    source_type: string;
    source_name: string;
    quantity: number;
    appointment_count: number;
  }[];
}

export function useProductConsumption(startDate?: Date, endDate?: Date) {
  const queryClient = useQueryClient();

  const { data: consumptionRecords = [], isLoading, refetch } = useQuery({
    queryKey: ['appointment_product_consumption', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from('appointment_product_consumption')
        .select(`
          *,
          appointment:appointments(id, start_time, status, service_id, service:services(id, name)),
          product:products(id, name, unit)
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      
      // Filter by date range if provided
      if (startDate && endDate && data) {
        return data.filter(record => {
          const appointmentDate = parseISO((record as any).appointment?.start_time);
          return isWithinInterval(appointmentDate, { start: startDate, end: endDate });
        });
      }
      
      return data || [];
    },
  });

  const createConsumption = useMutation({
    mutationFn: async (consumption: {
      appointment_id: string;
      product_id: string;
      quantity_used: number;
      source_type: 'service' | 'package_template';
      source_id: string;
    }) => {
      const { data, error } = await supabase
        .from('appointment_product_consumption')
        .insert(consumption)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment_product_consumption'] });
    },
  });

  // Generate consumption report grouped by product
  const consumptionReport = useMemo((): ProductConsumptionReport[] => {
    if (!consumptionRecords.length) return [];

    const productMap = new Map<string, ProductConsumptionReport>();

    consumptionRecords.forEach((record: any) => {
      const productId = record.product_id;
      const productName = record.product?.name || 'Desconhecido';
      const productUnit = record.product?.unit || 'un';
      const sourceName = record.appointment?.service?.name || 'Desconhecido';

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product_id: productId,
          product_name: productName,
          product_unit: productUnit,
          total_quantity: 0,
          appointment_count: 0,
          avg_per_appointment: 0,
          by_source: [],
        });
      }

      const report = productMap.get(productId)!;
      report.total_quantity += record.quantity_used;
      report.appointment_count += 1;

      // Group by source
      const existingSource = report.by_source.find(
        s => s.source_type === record.source_type && s.source_name === sourceName
      );
      if (existingSource) {
        existingSource.quantity += record.quantity_used;
        existingSource.appointment_count += 1;
      } else {
        report.by_source.push({
          source_type: record.source_type,
          source_name: sourceName,
          quantity: record.quantity_used,
          appointment_count: 1,
        });
      }
    });

    // Calculate averages
    productMap.forEach(report => {
      report.avg_per_appointment = report.appointment_count > 0 
        ? report.total_quantity / report.appointment_count 
        : 0;
    });

    return Array.from(productMap.values()).sort((a, b) => 
      b.total_quantity - a.total_quantity
    );
  }, [consumptionRecords]);

  return {
    consumptionRecords,
    consumptionReport,
    isLoading,
    refetch,
    createConsumption,
  };
}
