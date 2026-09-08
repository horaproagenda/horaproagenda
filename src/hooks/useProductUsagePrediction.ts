import { useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfessionalScopeFlags } from '@/hooks/useProfessionalScopeFlags';
import { filterProductsForNotifications } from '@/lib/productNotificationScope';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, startOfDay, isBefore, isToday } from 'date-fns';
import { averageFromCycles, projectStockDuration } from '@/lib/productCycleAnalytics';
import type { Product } from '@/hooks/useProducts';


export interface ProductUsageHistory {
  product_id: string;
  purchase_id: string;
  quantity: number;
  started_using_at: string | null;
  finished_at: string | null;
  duration_days: number | null;
  appointments_count: number;
}

export interface ProductExpiryInfo {
  product_id: string;
  product_name: string;
  expiry_date: string;
  days_until_expiry: number;
  is_expired: boolean;
  is_expiring_today: boolean;
  is_expiring_soon: boolean; // Within 7 days
  expiry_alert_level: 'ok' | 'warning' | 'critical';
  expiry_message: string | null;
}

export interface ProductUsagePrediction {
  product_id: string;
  product_name: string;
  product_unit: string;
  current_stock: number;
  min_stock_alert: number;
  expiry_date: string | null;
  
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
  
  // Expiry info
  days_until_expiry: number | null;
  is_expired: boolean;
  is_expiring_today: boolean;
  is_expiring_soon: boolean;
  expiry_alert_level: 'ok' | 'warning' | 'critical';
  expiry_message: string | null;
}

interface CompletedCycleRow {
  product_id: string;
  total_consumed: number | null;
  appointments_counted: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface ActiveCycleRow {
  product_id: string;
  started_using_at: string | null;
  cycle_quantity: number | null;
  cycle_unit: string | null;
}

export function useProductUsagePrediction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { onlyOwnProducts } = useProfessionalScopeFlags();

  // Fetch all products with their purchase history
  const { data: allProductsRaw = [] } = useQuery({
    queryKey: ['products-for-prediction'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return (data || []) as Product[];
    },
  });

  // Cada pessoa só é avisada sobre os produtos que lhe pertencem:
  // estoque próprio do profissional x estoque da clínica.
  const products = useMemo(
    () => filterProductsForNotifications(allProductsRaw, { userId: user?.id, onlyOwnProducts }),
    [allProductsRaw, onlyOwnProducts, user?.id],
  );



  // Registros encerrados são a fonte única das médias e previsões.
  const { data: cycleHistory = [] } = useQuery({
    queryKey: ['product-cycle-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_usage_records')
        .select('*')
        .order('end_date', { ascending: false });
      
      if (error) throw error;
      return (data || []) as CompletedCycleRow[];
    },
  });

  const { data: activeCycles = [] } = useQuery({
    queryKey: ['product-active-cycles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_purchases')
        .select('id, product_id, started_using_at, cycle_quantity, cycle_unit')
        .not('started_using_at', 'is', null)
        .is('finished_at', null);
      if (error) throw error;
      return (data || []) as ActiveCycleRow[];
    },
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['products-for-prediction'] });
      queryClient.invalidateQueries({ queryKey: ['product-cycle-history'] });
      queryClient.invalidateQueries({ queryKey: ['product-active-cycles'] });
    };
    const channel = supabase
      .channel('product-predictions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_purchases' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_usage_records' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_daily_consumption' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Calculate predictions for each product
  const predictions = useMemo((): ProductUsagePrediction[] => {
    return products.map(product => {
      const completedCycles = cycleHistory.filter((record) => record.product_id === product.id);
      const activeCycle = activeCycles.find((cycle) => cycle.product_id === product.id);
      const totalHistoricalAppointments = completedCycles.reduce((sum, record) => sum + Number(record.appointments_counted || 0), 0);
      const totalUnitsConsumed = completedCycles.reduce((sum, record) => sum + Number(record.total_consumed || 0), 0);
      const totalDaysUsed = completedCycles.reduce((sum, record) => {
        if (!record.start_date || !record.end_date) return sum;
        return sum + Math.max(1, differenceInDays(parseISO(record.end_date), parseISO(record.start_date)) + 1);
      }, 0);
      
      // Médias reais medidas em ciclos com quantidade parcial em uso
      // (ex.: 100 das 600 unidades). Quando existem, têm prioridade — são
      // medições diretas de quanto o produto rende por atendimento.
      const cycleAverage = averageFromCycles(
        completedCycles.map((record) => ({
          cycle_quantity: record.total_consumed,
          cycle_appointments: record.appointments_counted,
          started_using_at: record.start_date,
          finished_at: record.end_date,
        })),
      );

      const avgAppointmentsPerUnit = cycleAverage.avgQuantityPerAppointment
        ? 1 / cycleAverage.avgQuantityPerAppointment
        : totalUnitsConsumed > 0
          ? totalHistoricalAppointments / totalUnitsConsumed
          : 0;

      const avgDaysPerUnit = cycleAverage.daysPerUnit
        ? cycleAverage.daysPerUnit
        : totalUnitsConsumed > 0
          ? totalDaysUsed / totalUnitsConsumed
          : 0;
      
      // Calculate current usage (since last purchase or started_using_at)
      const currentStartDate = activeCycle?.started_using_at
        ? parseISO(activeCycle.started_using_at)
        : product.started_using_at
        ? parseISO(product.started_using_at)
        : parseISO(product.created_at);
      const currentDays = Math.max(0, differenceInDays(startOfDay(new Date()), startOfDay(currentStartDate)) + 1);
      const averageCycleDays = completedCycles.length > 0 ? totalDaysUsed / completedCycles.length : 0;
      const cycleProgress = activeCycle && averageCycleDays > 0 ? currentDays / averageCycleDays : 0;
      const averageAppointmentsPerCycle = completedCycles.length > 0 ? totalHistoricalAppointments / completedCycles.length : 0;
      const currentAppointments = Math.max(0, Math.round(averageAppointmentsPerCycle * Math.min(cycleProgress, 1)));
      
      // Predict remaining usage
      const cycleForecast = cycleAverage.avgQuantityPerAppointment
        ? projectStockDuration({
            stockQuantity: Number(product.current_stock || 0),
            avgQuantityPerAppointment: cycleAverage.avgQuantityPerAppointment,
            appointmentsPerDay: cycleAverage.appointmentsPerDay,
          })
        : null;

      const predictedRemainingAppointments = cycleForecast?.remainingAppointments != null
        ? cycleForecast.remainingAppointments
        : avgAppointmentsPerUnit > 0
          ? Math.max(0, (product.current_stock * avgAppointmentsPerUnit) - currentAppointments)
          : -1; // -1 means no historical data
      
      const predictedRemainingDays = cycleForecast?.remainingDays != null
        ? cycleForecast.remainingDays
        : avgDaysPerUnit > 0
          ? Math.max(0, (product.current_stock * avgDaysPerUnit) - currentDays)
          : -1;

      
      // Calculate depletion percentage based on usage pattern
      let depletionPercentage = 0;
      if (activeCycle && averageCycleDays > 0) depletionPercentage = cycleProgress * 100;
      
      // Determine alert levels
      const isLowStock = product.current_stock <= (product.min_stock_alert || 0);
      const isNearDepletionByUsage = predictedRemainingAppointments >= 0 && predictedRemainingAppointments <= 5;
      // Janela de recompra: avisa com 14 dias de antecedência para dar tempo de comprar
      const isNearDepletionByTime = predictedRemainingDays >= 0 && predictedRemainingDays <= 14;
      
      let alertLevel: 'ok' | 'warning' | 'critical' = 'ok';
      let alertMessage: string | null = null;
      
      if (isLowStock || (isNearDepletionByUsage && predictedRemainingAppointments <= 2)) {
        alertLevel = 'critical';
        if (isLowStock && isNearDepletionByUsage) {
          alertMessage = `Estoque baixo! Compre mais: rende ainda ~${Math.round(predictedRemainingAppointments)} atendimento(s)`;
        } else if (isLowStock) {
          alertMessage = `Estoque abaixo do mínimo (${product.min_stock_alert} ${product.unit}). Hora de comprar mais.`;
        } else {
          alertMessage = `Produto próximo de acabar (~${Math.round(predictedRemainingAppointments)} atendimento(s)). Compre mais.`;
        }
      } else if (isNearDepletionByUsage || isNearDepletionByTime || depletionPercentage >= 80) {
        alertLevel = 'warning';
        if (isNearDepletionByUsage) {
          alertMessage = `Atenção: rende ainda ~${Math.round(predictedRemainingAppointments)} atendimento(s). Programe a compra.`;
        } else if (isNearDepletionByTime) {
          alertMessage = `Atenção: o estoque deve durar ~${Math.round(predictedRemainingDays)} dia(s). Programe a compra.`;
        } else {
          alertMessage = `${Math.round(depletionPercentage)}% do produto utilizado`;
        }
      }

      
      // Calculate expiry information
      let daysUntilExpiry: number | null = null;
      let isExpired = false;
      let isExpiringToday = false;
      let isExpiringSoon = false;
      let expiryAlertLevel: 'ok' | 'warning' | 'critical' = 'ok';
      let expiryMessage: string | null = null;
      
      if (product.expiry_date) {
        const expiryDate = startOfDay(parseISO(product.expiry_date));
        const today = startOfDay(new Date());
        daysUntilExpiry = differenceInDays(expiryDate, today);
        
        isExpired = isBefore(expiryDate, today);
        isExpiringToday = isToday(expiryDate);
        isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7;
        
        if (isExpired) {
          expiryAlertLevel = 'critical';
          expiryMessage = `Produto VENCIDO! Lembre-se de descartá-lo`;
        } else if (isExpiringToday) {
          expiryAlertLevel = 'critical';
          expiryMessage = `Produto vence HOJE! Lembre-se de descartá-lo`;
        } else if (isExpiringSoon) {
          expiryAlertLevel = 'warning';
          expiryMessage = `Produto vence em ${daysUntilExpiry} dia(s)`;
        }
      }
      
      return {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        current_stock: product.current_stock,
        min_stock_alert: product.min_stock_alert || 0,
        expiry_date: product.expiry_date,
        
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
        
        // Expiry info
        days_until_expiry: daysUntilExpiry,
        is_expired: isExpired,
        is_expiring_today: isExpiringToday,
        is_expiring_soon: isExpiringSoon,
        expiry_alert_level: expiryAlertLevel,
        expiry_message: expiryMessage,
      };
    });
  }, [products, cycleHistory, activeCycles]);

  const criticalProducts = predictions.filter(p => p.alert_level === 'critical');
  const warningProducts = predictions.filter(p => p.alert_level === 'warning');
  
  // Expiry alerts
  const expiringProducts = predictions.filter(p => p.expiry_alert_level !== 'ok');
  const expiredProducts = predictions.filter(p => p.is_expired);
  const expiringTodayProducts = predictions.filter(p => p.is_expiring_today);
  const expiringSoonProducts = predictions.filter(p => p.is_expiring_soon);

  return {
    predictions,
    criticalProducts,
    warningProducts,
    expiringProducts,
    expiredProducts,
    expiringTodayProducts,
    expiringSoonProducts,
    totalAlerts: criticalProducts.length + warningProducts.length + expiringProducts.length,
  };
}
