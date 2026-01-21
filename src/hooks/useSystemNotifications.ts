import { useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isToday, isBefore, startOfDay, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { useProductUsagePrediction } from './useProductUsagePrediction';

export interface SystemNotification {
  id: string;
  type: 'boleto' | 'package' | 'stock' | 'usage_prediction';
  title: string;
  description: string;
  severity: 'warning' | 'critical' | 'info';
  date?: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'financial_entry' | 'package' | 'product' | 'client';
  clientId?: string;
}

// Get today's date as string for localStorage key
const getTodayKey = () => format(new Date(), 'yyyy-MM-dd');

// Check if notifications were already shown today
const wasShownToday = () => {
  const lastShown = localStorage.getItem('notifications_last_shown');
  return lastShown === getTodayKey();
};

// Mark notifications as shown today
const markAsShownToday = () => {
  localStorage.setItem('notifications_last_shown', getTodayKey());
};

export function useSystemNotifications() {
  const hasShownToasts = useRef(wasShownToday());

  // Fetch boletos vencendo hoje
  const { data: boletosVencendoHoje = [] } = useQuery({
    queryKey: ['boletos-vencendo-hoje'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('financial_entries')
        .select(`
          *,
          payment_method:payment_methods(name)
        `)
        .eq('type', 'payable')
        .eq('status', 'pending')
        .eq('due_date', today);
      
      if (error) throw error;
      
      // Filter only those with boleto payment method
      return (data || []).filter(entry => 
        entry.payment_method?.name?.toLowerCase().includes('boleto')
      );
    },
    refetchInterval: 60000, // Check every minute
  });

  // Fetch pacotes com poucas sessões
  const { data: packageLowSessions = [] } = useQuery({
    queryKey: ['packages-low-sessions'],
    queryFn: async () => {
      const { data: packages, error } = await supabase
        .from('service_packages')
        .select(`
          *,
          client:clients(name),
          package_appointments(status)
        `)
        .eq('is_active', true);
      
      if (error) throw error;
      
      return (packages || [])
        .map(pkg => {
          const usedSessions = pkg.package_appointments?.filter(
            (pa: any) => pa.status === 'completed'
          ).length || 0;
          const remaining = pkg.total_sessions - usedSessions;
          return { ...pkg, usedSessions, remaining };
        })
        .filter(pkg => pkg.remaining > 0 && pkg.remaining <= 2); // 2 or fewer sessions remaining
    },
    refetchInterval: 300000, // Check every 5 minutes
  });

  // Fetch produtos com estoque baixo
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['products-low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      return (data || []).filter(product => 
        product.current_stock <= (product.min_stock_alert || 0)
      );
    },
    refetchInterval: 300000, // Check every 5 minutes
  });

  // Get usage predictions for additional alerts
  const { criticalProducts: usageCritical, warningProducts: usageWarning } = useProductUsagePrediction();

  // Generate notifications
  const notifications = useMemo((): SystemNotification[] => {
    const result: SystemNotification[] = [];

    // Boletos vencendo hoje
    boletosVencendoHoje.forEach(boleto => {
      result.push({
        id: `boleto-${boleto.id}`,
        type: 'boleto',
        title: 'Boleto vencendo hoje',
        description: `${boleto.description} - R$ ${Number(boleto.amount).toFixed(2)}`,
        severity: 'critical',
        date: boleto.due_date,
        link: `/financeiro?tab=pagar&entry=${boleto.id}`,
        referenceId: boleto.id,
        referenceType: 'financial_entry',
      });
    });

    // Pacotes com poucas sessões - link to client profile
    packageLowSessions.forEach(pkg => {
      result.push({
        id: `package-${pkg.id}`,
        type: 'package',
        title: 'Pacote com poucas sessões',
        description: `${pkg.client?.name}: ${pkg.name} - ${pkg.remaining} sessão(ões) restante(s)`,
        severity: pkg.remaining === 1 ? 'critical' : 'warning',
        link: `/cliente/${pkg.client_id}?tab=agendamentos`,
        referenceId: pkg.id,
        referenceType: 'package',
        clientId: pkg.client_id,
      });
    });

    // Produtos com estoque baixo (from DB) - link to product detail
    lowStockProducts.forEach(product => {
      result.push({
        id: `stock-${product.id}`,
        type: 'stock',
        title: 'Estoque baixo',
        description: `${product.name}: ${product.current_stock} ${product.unit} restante(s)`,
        severity: product.current_stock === 0 ? 'critical' : 'warning',
        link: `/produtos?product=${product.id}`,
        referenceId: product.id,
        referenceType: 'product',
      });
    });

    // Produtos próximos de acabar (from usage prediction) - only if not already in stock alerts
    const stockProductIds = new Set(lowStockProducts.map(p => p.id));
    
    usageCritical.forEach(product => {
      if (!stockProductIds.has(product.product_id) && product.is_near_depletion_by_usage) {
        result.push({
          id: `usage-${product.product_id}`,
          type: 'usage_prediction',
          title: 'Produto próximo de acabar',
          description: product.alert_message || `${product.product_name}: ~${Math.round(product.predicted_remaining_appointments)} atendimentos`,
          severity: 'critical',
          link: `/produtos?product=${product.product_id}`,
          referenceId: product.product_id,
          referenceType: 'product',
        });
      }
    });

    usageWarning.forEach(product => {
      if (!stockProductIds.has(product.product_id)) {
        result.push({
          id: `usage-${product.product_id}`,
          type: 'usage_prediction',
          title: 'Atenção: produto',
          description: product.alert_message || `${product.product_name}: uso elevado`,
          severity: 'warning',
          link: `/produtos?product=${product.product_id}`,
          referenceId: product.product_id,
          referenceType: 'product',
        });
      }
    });

    return result;
  }, [boletosVencendoHoje, packageLowSessions, lowStockProducts, usageCritical, usageWarning]);

  // Show toasts for critical notifications (only once per day)
  useEffect(() => {
    if (hasShownToasts.current || notifications.length === 0) return;

    const criticalNotifications = notifications.filter(n => n.severity === 'critical');
    
    if (criticalNotifications.length > 0) {
      hasShownToasts.current = true;
      markAsShownToday();

      // Show first 3 critical notifications as toasts
      criticalNotifications.slice(0, 3).forEach((notification, index) => {
        setTimeout(() => {
          if (notification.type === 'boleto') {
            toast.error(notification.title, {
              description: notification.description,
              duration: 10000,
            });
          } else if (notification.type === 'stock' || notification.type === 'usage_prediction') {
            toast.warning(notification.title, {
              description: notification.description,
              duration: 8000,
            });
          } else {
            toast.warning(notification.title, {
              description: notification.description,
              duration: 8000,
            });
          }
        }, index * 1000); // Stagger by 1 second
      });

      // If there are more than 3, show a summary
      if (criticalNotifications.length > 3) {
        setTimeout(() => {
          toast.info(
            `E mais ${criticalNotifications.length - 3} alerta(s) crítico(s)`,
            { 
              description: 'Verifique o painel de notificações',
              duration: 5000 
            }
          );
        }, 4000);
      }
    }
  }, [notifications]);

  return {
    notifications,
    boletosCount: boletosVencendoHoje.length,
    lowSessionsCount: packageLowSessions.length,
    lowStockCount: lowStockProducts.length + usageCritical.length,
    totalCritical: notifications.filter(n => n.severity === 'critical').length,
  };
}
