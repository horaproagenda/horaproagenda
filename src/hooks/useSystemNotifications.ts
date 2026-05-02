import { useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isToday, isBefore, startOfDay, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useProductUsagePrediction } from './useProductUsagePrediction';
import { useReminders } from './useReminders';
import { useCashRegisters } from './useCashRegisters';
import { useBusinessSettings } from './useBusinessSettings';
import {
  isNotificationDismissed,
  dismissNotification,
  wasShownThisSession,
  markShownThisSession,
} from '@/lib/notificationDismissal';

export interface SystemNotification {
  id: string;
  signature: string;
  type: 'boleto' | 'package' | 'stock' | 'usage_prediction' | 'expiry' | 'reminder' | 'cash_register';
  title: string;
  description: string;
  severity: 'warning' | 'critical' | 'info';
  date?: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'financial_entry' | 'package' | 'product' | 'client' | 'reminder' | 'cash_register';
  clientId?: string;
}

export function useSystemNotifications() {
  const hasShownToasts = useRef(wasShownThisSession());

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

  // Get usage predictions for additional alerts (including expiry)
  const { 
    criticalProducts: usageCritical, 
    warningProducts: usageWarning,
    expiredProducts,
    expiringTodayProducts,
    expiringSoonProducts,
  } = useProductUsagePrediction();

  // Get reminders for today
  const { todayReminders } = useReminders();

  // Get cash register status
  const { currentOpenRegister, cashRegisters } = useCashRegisters();
  const { settings } = useBusinessSettings();

  // Check for old open cash registers (from previous days)
  const oldOpenRegisters = useMemo(() => {
    const todayStart = startOfDay(new Date());
    return cashRegisters.filter(register => {
      if (register.status !== 'open') return false;
      const openedAt = parseISO(register.opened_at);
      return isBefore(openedAt, todayStart);
    });
  }, [cashRegisters]);

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
        link: `/clientes/${pkg.client_id}?tab=agendamentos`,
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

    // Expired products - critical
    expiredProducts.forEach(product => {
      result.push({
        id: `expiry-expired-${product.product_id}`,
        type: 'expiry',
        title: 'Produto VENCIDO',
        description: `${product.product_name}: ${product.expiry_message || 'Vencido - descarte imediatamente'}`,
        severity: 'critical',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    // Products expiring today - critical
    expiringTodayProducts.forEach(product => {
      result.push({
        id: `expiry-today-${product.product_id}`,
        type: 'expiry',
        title: 'Produto vence HOJE',
        description: `${product.product_name}: ${product.expiry_message || 'Vence hoje - lembre-se de descartá-lo'}`,
        severity: 'critical',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    // Products expiring soon - warning
    expiringSoonProducts.forEach(product => {
      result.push({
        id: `expiry-soon-${product.product_id}`,
        type: 'expiry',
        title: 'Produto próximo do vencimento',
        description: `${product.product_name}: ${product.expiry_message || `Vence em ${product.days_until_expiry} dias`}`,
        severity: 'warning',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    // Today's reminders
    todayReminders.forEach(reminder => {
      const timeStr = reminder.reminder_time ? ` às ${reminder.reminder_time.substring(0, 5)}` : '';
      result.push({
        id: `reminder-${reminder.id}`,
        type: 'reminder',
        title: `Lembrete: ${reminder.title}`,
        description: `${reminder.description || 'Lembrete agendado para hoje'}${timeStr}`,
        severity: reminder.priority === 'high' ? 'critical' : 'info',
        date: reminder.reminder_date || undefined,
        link: '/lembretes',
        referenceId: reminder.id,
        referenceType: 'reminder',
      });
    });

    // Old open cash registers (from previous days) - CRITICAL
    oldOpenRegisters.forEach(register => {
      const openedDate = format(parseISO(register.opened_at), "dd/MM/yyyy", { locale: ptBR });
      result.push({
        id: `old-cash-register-${register.id}`,
        type: 'cash_register',
        title: '⚠️ Caixa do dia anterior aberto!',
        description: `Caixa aberto em ${openedDate} não foi fechado. Feche-o antes de continuar.`,
        severity: 'critical',
        link: '/caixa?tab=caixa',
        referenceId: register.id,
        referenceType: 'cash_register',
      });
    });

    // Cash register open reminder (at end of day)
    if (currentOpenRegister && settings?.closing_time) {
      const now = new Date();
      const currentHour = now.getHours();
      const [closingHour] = settings.closing_time.split(':').map(Number);
      
      // Show warning if within 2 hours of closing time or past closing time
      if (currentHour >= closingHour - 2) {
        result.push({
          id: `cash-register-${currentOpenRegister.id}`,
          type: 'cash_register',
          title: 'Caixa aberto',
          description: currentHour >= closingHour 
            ? 'O expediente terminou. Lembre-se de fechar o caixa!' 
            : 'Lembre-se de fechar o caixa antes de encerrar o expediente',
          severity: currentHour >= closingHour ? 'critical' : 'warning',
          link: '/caixa',
          referenceId: currentOpenRegister.id,
          referenceType: 'cash_register',
        });
      }
    }

    return result;
  }, [boletosVencendoHoje, packageLowSessions, lowStockProducts, usageCritical, usageWarning, expiredProducts, expiringTodayProducts, expiringSoonProducts, todayReminders, currentOpenRegister, oldOpenRegisters, settings]);

  // Show toasts for critical notifications (only once per session, when app opens)
  useEffect(() => {
    if (hasShownToasts.current || notifications.length === 0) return;

    const criticalNotifications = notifications.filter(n => 
      n.severity === 'critical' && !wasNotificationDismissed(n.id)
    );
    
    if (criticalNotifications.length > 0) {
      hasShownToasts.current = true;
      markAsShownThisSession();

      // Show first 3 critical notifications as toasts
      criticalNotifications.slice(0, 3).forEach((notification, index) => {
        setTimeout(() => {
          // Mark this notification as shown so it won't appear again today
          markNotificationDismissed(notification.id);
          
          if (notification.type === 'boleto') {
            toast.error(notification.title, {
              description: notification.description,
              duration: 10000,
            });
          } else if (notification.type === 'expiry') {
            toast.error(notification.title, {
              description: notification.description,
              duration: 10000,
            });
          } else if (notification.type === 'cash_register') {
            toast.error(notification.title, {
              description: notification.description,
              duration: 15000,
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
