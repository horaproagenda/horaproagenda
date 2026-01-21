import { useEffect, useRef, useCallback } from 'react';
import { useProductUsagePrediction, ProductUsagePrediction } from './useProductUsagePrediction';
import { useBusinessSettings } from './useBusinessSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Get today's date as string for localStorage key
const getTodayKey = () => format(new Date(), 'yyyy-MM-dd');
const STORAGE_KEY = 'stock_alerts_last_sent';

// Check if alerts were already sent today
const wasAlertSentToday = (productIds: string[]): boolean => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  
  try {
    const data = JSON.parse(stored);
    if (data.date !== getTodayKey()) return false;
    
    // Check if all product IDs were already notified today
    const sentIds = new Set(data.productIds || []);
    return productIds.every(id => sentIds.has(id));
  } catch {
    return false;
  }
};

// Mark alerts as sent today
const markAlertsSentToday = (productIds: string[]) => {
  const stored = localStorage.getItem(STORAGE_KEY);
  let existingIds: string[] = [];
  
  try {
    const data = JSON.parse(stored || '{}');
    if (data.date === getTodayKey()) {
      existingIds = data.productIds || [];
    }
  } catch {
    // ignore
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: getTodayKey(),
    productIds: [...new Set([...existingIds, ...productIds])],
  }));
};

interface StockAlert {
  product_id: string;
  product_name: string;
  product_unit: string;
  current_stock: number;
  min_stock_alert: number;
  alert_type: 'low_stock' | 'near_depletion';
  predicted_remaining_appointments?: number;
  predicted_remaining_days?: number;
}

export function useStockAlertNotifications(notifyPhone?: string) {
  const { predictions, criticalProducts, warningProducts } = useProductUsagePrediction();
  const { settings } = useBusinessSettings();
  const hasNotifiedRef = useRef(false);

  const sendNotifications = useCallback(async (alerts: StockAlert[]) => {
    if (alerts.length === 0) return;
    
    const productIds = alerts.map(a => a.product_id);
    
    // Check if already sent today
    if (wasAlertSentToday(productIds)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('notify-stock-alerts', {
        body: { 
          alerts,
          notifyPhone,
        }
      });

      if (error) {
        console.error('Error sending stock alerts:', error);
        return;
      }

      if (data?.success) {
        markAlertsSentToday(productIds);
        
        if (data.whatsapp_sent) {
          toast.success('Alertas de estoque enviados via WhatsApp');
        }
      }
    } catch (error) {
      console.error('Error sending stock alert notifications:', error);
    }
  }, [notifyPhone]);

  // Show in-app toasts for critical products (once per session)
  useEffect(() => {
    if (hasNotifiedRef.current || criticalProducts.length === 0) return;
    
    hasNotifiedRef.current = true;

    // Show first 3 critical alerts as toasts
    criticalProducts.slice(0, 3).forEach((product, index) => {
      setTimeout(() => {
        toast.warning(`Estoque baixo: ${product.product_name}`, {
          description: product.alert_message || `${product.current_stock} ${product.product_unit} restante(s)`,
          duration: 8000,
        });
      }, index * 1500);
    });

    if (criticalProducts.length > 3) {
      setTimeout(() => {
        toast.info(`E mais ${criticalProducts.length - 3} produto(s) com estoque baixo`, {
          description: 'Verifique a página de Produtos',
          duration: 5000,
        });
      }, 5000);
    }
  }, [criticalProducts]);

  // Prepare alerts for WhatsApp notification
  useEffect(() => {
    if (!notifyPhone) return;
    
    const alerts: StockAlert[] = [];

    criticalProducts.forEach(p => {
      alerts.push({
        product_id: p.product_id,
        product_name: p.product_name,
        product_unit: p.product_unit,
        current_stock: p.current_stock,
        min_stock_alert: p.min_stock_alert,
        alert_type: 'low_stock',
        predicted_remaining_appointments: p.predicted_remaining_appointments,
        predicted_remaining_days: p.predicted_remaining_days,
      });
    });

    warningProducts.forEach(p => {
      if (p.is_near_depletion_by_usage || p.is_near_depletion_by_time) {
        alerts.push({
          product_id: p.product_id,
          product_name: p.product_name,
          product_unit: p.product_unit,
          current_stock: p.current_stock,
          min_stock_alert: p.min_stock_alert,
          alert_type: 'near_depletion',
          predicted_remaining_appointments: p.predicted_remaining_appointments,
          predicted_remaining_days: p.predicted_remaining_days,
        });
      }
    });

    if (alerts.length > 0) {
      sendNotifications(alerts);
    }
  }, [criticalProducts, warningProducts, notifyPhone, sendNotifications]);

  return {
    predictions,
    criticalProducts,
    warningProducts,
    totalAlerts: criticalProducts.length + warningProducts.length,
  };
}
