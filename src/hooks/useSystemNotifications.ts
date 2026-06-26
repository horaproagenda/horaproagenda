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

  // Fetch TODAS as contas (a pagar e a receber) vencendo hoje
  const { data: boletosVencendoHoje = [] } = useQuery({
    queryKey: ['contas-vencendo-hoje'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('financial_entries')
        .select(`
          *,
          payment_method:payment_methods(name)
        `)
        .eq('status', 'pending')
        .eq('due_date', today);

      if (error) throw error;
      return data || [];
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
  const allNotifications = useMemo((): SystemNotification[] => {
    const result: SystemNotification[] = [];

    // Contas (pagar/receber) vencendo hoje
    boletosVencendoHoje.forEach((entry: any) => {
      const id = `bill-${entry.id}`;
      const isPayable = entry.type === 'payable';
      const tabSlug = isPayable ? 'pagar' : 'receber';
      const titlePrefix = isPayable ? 'Conta a pagar' : 'Conta a receber';
      result.push({
        id,
        signature: `${id}|${entry.due_date}|${Number(entry.amount).toFixed(2)}|${entry.status}`,
        type: 'boleto',
        title: `${titlePrefix} vencendo hoje`,
        description: `${entry.description} - R$ ${Number(entry.amount).toFixed(2)}`,
        severity: 'critical',
        date: entry.due_date,
        link: `/financeiro?tab=${tabSlug}&entry=${entry.id}`,
        referenceId: entry.id,
        referenceType: 'financial_entry',
      });
    });

    // Pacotes com poucas sessões
    packageLowSessions.forEach(pkg => {
      const id = `package-${pkg.id}`;
      result.push({
        id,
        signature: `${id}|remaining:${pkg.remaining}`,
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

    // Produtos com estoque baixo
    lowStockProducts.forEach(product => {
      const id = `stock-${product.id}`;
      result.push({
        id,
        signature: `${id}|stock:${product.current_stock}`,
        type: 'stock',
        title: 'Estoque baixo',
        description: `${product.name}: ${product.current_stock} ${product.unit} restante(s)`,
        severity: product.current_stock === 0 ? 'critical' : 'warning',
        link: `/produtos?product=${product.id}`,
        referenceId: product.id,
        referenceType: 'product',
      });
    });

    const stockProductIds = new Set(lowStockProducts.map(p => p.id));

    usageCritical.forEach(product => {
      if (!stockProductIds.has(product.product_id) && product.is_near_depletion_by_usage) {
        const id = `usage-${product.product_id}`;
        result.push({
          id,
          signature: `${id}|crit|${Math.round(product.predicted_remaining_appointments)}`,
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
        const id = `usage-${product.product_id}`;
        result.push({
          id,
          signature: `${id}|warn|${Math.round(product.predicted_remaining_appointments ?? 0)}`,
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

    expiredProducts.forEach(product => {
      const id = `expiry-expired-${product.product_id}`;
      result.push({
        id,
        signature: `${id}|${product.expiry_message ?? ''}`,
        type: 'expiry',
        title: 'Produto VENCIDO',
        description: `${product.product_name}: ${product.expiry_message || 'Vencido - descarte imediatamente'}`,
        severity: 'critical',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    expiringTodayProducts.forEach(product => {
      const id = `expiry-today-${product.product_id}`;
      result.push({
        id,
        signature: `${id}|${product.expiry_message ?? ''}`,
        type: 'expiry',
        title: 'Produto vence HOJE',
        description: `${product.product_name}: ${product.expiry_message || 'Vence hoje - lembre-se de descartá-lo'}`,
        severity: 'critical',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    expiringSoonProducts.forEach(product => {
      const id = `expiry-soon-${product.product_id}`;
      result.push({
        id,
        signature: `${id}|days:${product.days_until_expiry}`,
        type: 'expiry',
        title: 'Produto próximo do vencimento',
        description: `${product.product_name}: ${product.expiry_message || `Vence em ${product.days_until_expiry} dias`}`,
        severity: 'warning',
        link: `/produtos?product=${product.product_id}`,
        referenceId: product.product_id,
        referenceType: 'product',
      });
    });

    todayReminders.forEach(reminder => {
      const timeStr = reminder.reminder_time ? ` às ${reminder.reminder_time.substring(0, 5)}` : '';
      const id = `reminder-${reminder.id}`;
      result.push({
        id,
        signature: `${id}|${reminder.reminder_date ?? ''}|${reminder.reminder_time ?? ''}|${reminder.priority ?? ''}`,
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

    oldOpenRegisters.forEach(register => {
      const openedDate = format(parseISO(register.opened_at), "dd/MM/yyyy", { locale: ptBR });
      const id = `old-cash-register-${register.id}`;
      result.push({
        id,
        signature: `${id}|${register.opened_at}`,
        type: 'cash_register',
        title: '⚠️ Caixa do dia anterior aberto!',
        description: `Caixa aberto em ${openedDate} não foi fechado. Feche-o antes de continuar.`,
        severity: 'critical',
        link: '/caixa?tab=caixa',
        referenceId: register.id,
        referenceType: 'cash_register',
      });
    });

    if (currentOpenRegister && settings?.closing_time) {
      const now = new Date();
      const currentHour = now.getHours();
      const [closingHour] = settings.closing_time.split(':').map(Number);

      if (currentHour >= closingHour - 2) {
        const id = `cash-register-${currentOpenRegister.id}`;
        const phase = currentHour >= closingHour ? 'past' : 'pre';
        result.push({
          id,
          signature: `${id}|${format(now, 'yyyy-MM-dd')}|${phase}`,
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

  // Filter out dismissed (by signature) so they only re-appear when content changes
  const notifications = useMemo(
    () => allNotifications.filter(n => !isNotificationDismissed(n.id, n.signature)),
    [allNotifications]
  );

  // Show toasts for critical notifications (only once per session, when app opens)
  useEffect(() => {
    if (hasShownToasts.current || notifications.length === 0) return;

    const criticalNotifications = notifications.filter(n => n.severity === 'critical');

    if (criticalNotifications.length > 0) {
      hasShownToasts.current = true;
      markShownThisSession();

      // Show first 3 critical notifications as toasts
      criticalNotifications.slice(0, 3).forEach((notification, index) => {
        setTimeout(() => {
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
