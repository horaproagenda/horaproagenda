import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO } from 'date-fns';

export interface ProductUsageHistory {
  product_id: string;
  purchase_id: string;
  quantity: number;
  started_using_at: string | null;
  finished_at: string | null;
  duration_days: number | null;
  appointments_count: number;
}

export interface ProductUsagePrediction {
  product_id: string;
  product_name: string;
  product_unit: string;
  current_stock: number;
  min_stock_alert: number;
  
  // Historical data
  avg_appointments_per_unit: number;
  avg_days_per_unit: number;
  total_historical_appointments: number;
  total_units_consumed: number;
  
  // Current usage tracking
  current_appointments_since_purchase: number;
  current_days_since_purchase: number;
  
  // Predictions
  predicted_remaining_appointments: number;
  predicted_remaining_days: number;
  depletion_percentage: number;
  
  // Alert levels
  is_low_stock: boolean;
  is_near_depletion_by_usage: boolean;
  is_near_depletion_by_time: boolean;
  alert_level: 'ok' | 'warning' | 'critical';
  alert_message: string | null;
}

export function useProductUsagePrediction() {
  // Fetch all products with their purchase history
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-prediction'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch purchase history with usage data
  const { data: purchaseHistory = [] } = useQuery({
    queryKey: ['product-purchase-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_purchases')
        .select('*')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000,
  });

  // Fetch consumption records
  const { data: consumptionRecords = [] } = useQuery({
    queryKey: ['consumption-for-prediction'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointment_product_consumption')
        .select(`
          *,
          appointment:appointments(id, start_time)
        `);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000,
  });

  // Calculate predictions for each product
  const predictions = useMemo((): ProductUsagePrediction[] => {
    return products.map(product => {
      // Get completed purchases for this product (historical data)
      const completedPurchases = purchaseHistory.filter(p => p.product_id === product.id);
      
      // Get consumption records for this product
      const productConsumptions = consumptionRecords.filter((c: any) => c.product_id === product.id);
      
      // Calculate historical averages from completed purchases
      let totalHistoricalAppointments = 0;
      let totalUnitsConsumed = 0;
      let totalDaysUsed = 0;
      
      completedPurchases.forEach(purchase => {
        const purchaseConsumptions = productConsumptions.filter((c: any) => {
          const consumptionDate = parseISO((c.appointment as any)?.start_time);
          const startDate = purchase.started_using_at ? parseISO(purchase.started_using_at) : null;
          const endDate = purchase.finished_at ? parseISO(purchase.finished_at) : null;
          
          if (!startDate || !endDate) return false;
          return consumptionDate >= startDate && consumptionDate <= endDate;
        });
        
        totalHistoricalAppointments += purchaseConsumptions.length;
        totalUnitsConsumed += purchase.quantity;
        
        if (purchase.started_using_at && purchase.finished_at) {
          totalDaysUsed += differenceInDays(
            parseISO(purchase.finished_at),
            parseISO(purchase.started_using_at)
          );
        }
      });
      
      const avgAppointmentsPerUnit = totalUnitsConsumed > 0 
        ? totalHistoricalAppointments / totalUnitsConsumed 
        : 0;
      
      const avgDaysPerUnit = totalUnitsConsumed > 0 
        ? totalDaysUsed / totalUnitsConsumed 
        : 0;
      
      // Calculate current usage (since last purchase or started_using_at)
      const currentStartDate = product.started_using_at 
        ? parseISO(product.started_using_at) 
        : parseISO(product.created_at);
      
      const currentAppointments = productConsumptions.filter((c: any) => {
        const consumptionDate = parseISO((c.appointment as any)?.start_time);
        return consumptionDate >= currentStartDate;
      }).length;
      
      const currentDays = differenceInDays(new Date(), currentStartDate);
      
      // Predict remaining usage
      const predictedRemainingAppointments = avgAppointmentsPerUnit > 0
        ? Math.max(0, (product.current_stock * avgAppointmentsPerUnit) - currentAppointments)
        : -1; // -1 means no historical data
      
      const predictedRemainingDays = avgDaysPerUnit > 0
        ? Math.max(0, (product.current_stock * avgDaysPerUnit) - currentDays)
        : -1;
      
      // Calculate depletion percentage based on usage pattern
      let depletionPercentage = 0;
      if (avgAppointmentsPerUnit > 0) {
        const expectedTotalAppointments = product.current_stock * avgAppointmentsPerUnit;
        depletionPercentage = expectedTotalAppointments > 0 
          ? (currentAppointments / expectedTotalAppointments) * 100 
          : 0;
      }
      
      // Determine alert levels
      const isLowStock = product.current_stock <= (product.min_stock_alert || 0);
      const isNearDepletionByUsage = predictedRemainingAppointments >= 0 && predictedRemainingAppointments <= 5;
      const isNearDepletionByTime = predictedRemainingDays >= 0 && predictedRemainingDays <= 7;
      
      let alertLevel: 'ok' | 'warning' | 'critical' = 'ok';
      let alertMessage: string | null = null;
      
      if (isLowStock || (isNearDepletionByUsage && predictedRemainingAppointments <= 2)) {
        alertLevel = 'critical';
        if (isLowStock && isNearDepletionByUsage) {
          alertMessage = `Estoque baixo! Apenas ~${Math.round(predictedRemainingAppointments)} atendimentos restantes`;
        } else if (isLowStock) {
          alertMessage = `Estoque abaixo do mínimo (${product.min_stock_alert} ${product.unit})`;
        } else {
          alertMessage = `Produto próximo de acabar (~${Math.round(predictedRemainingAppointments)} atendimentos)`;
        }
      } else if (isNearDepletionByUsage || isNearDepletionByTime || depletionPercentage >= 80) {
        alertLevel = 'warning';
        if (isNearDepletionByUsage) {
          alertMessage = `Atenção: ~${Math.round(predictedRemainingAppointments)} atendimentos restantes`;
        } else if (isNearDepletionByTime) {
          alertMessage = `Atenção: ~${Math.round(predictedRemainingDays)} dias de uso restantes`;
        } else {
          alertMessage = `${Math.round(depletionPercentage)}% do produto utilizado`;
        }
      }
      
      return {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        current_stock: product.current_stock,
        min_stock_alert: product.min_stock_alert || 0,
        
        avg_appointments_per_unit: avgAppointmentsPerUnit,
        avg_days_per_unit: avgDaysPerUnit,
        total_historical_appointments: totalHistoricalAppointments,
        total_units_consumed: totalUnitsConsumed,
        
        current_appointments_since_purchase: currentAppointments,
        current_days_since_purchase: currentDays,
        
        predicted_remaining_appointments: predictedRemainingAppointments,
        predicted_remaining_days: predictedRemainingDays,
        depletion_percentage: Math.min(100, depletionPercentage),
        
        is_low_stock: isLowStock,
        is_near_depletion_by_usage: isNearDepletionByUsage,
        is_near_depletion_by_time: isNearDepletionByTime,
        alert_level: alertLevel,
        alert_message: alertMessage,
      };
    });
  }, [products, purchaseHistory, consumptionRecords]);

  const criticalProducts = predictions.filter(p => p.alert_level === 'critical');
  const warningProducts = predictions.filter(p => p.alert_level === 'warning');

  return {
    predictions,
    criticalProducts,
    warningProducts,
    totalAlerts: criticalProducts.length + warningProducts.length,
  };
}
