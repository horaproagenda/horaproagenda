import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';
import { toast } from 'sonner';
import { recordRefetch } from '@/lib/perfMetrics';

/**
 * Hook para sincronização em tempo real entre todas as tabelas.
 *
 * ARQUITETURA:
 * - Escuta Supabase Realtime (WebSocket) por tenant (account_owner_id).
 * - Agrupa invalidações num microtask/rAF único → um evento no banco não
 *   dispara dezenas de refetch em cascata.
 * - `refetchType: 'active'` — apenas queries com componentes montados
 *   são refazidas. Queries em cache mas fora de tela ficam stale e
 *   revalidam quando a rota abrir de novo.
 * - Registra contagem de refetch por queryKey em `perfMetrics` para
 *   detectar loops automaticamente.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  useEffect(() => {
    if (!accountOwnerId) return;

    // ---- Batching de invalidações ---------------------------------------
    // Vários eventos do Realtime podem chegar no mesmo tick (uma mutation
    // multi-linha ou triggers em cascata). Em vez de invalidar N vezes,
    // acumulamos as keys e fazemos UM flush por microtask.
    const pending = new Set<string>();
    let flushScheduled = false;
    const scheduleFlush = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      queueMicrotask(() => {
        flushScheduled = false;
        if (pending.size === 0) return;
        const keys = Array.from(pending);
        pending.clear();
        keys.forEach((key) => {
          recordRefetch(key);
          queryClient.invalidateQueries({
            queryKey: [key],
            refetchType: 'active',
          });
        });
      });
    };
    const invalidateKeys = (keys: readonly string[]) => {
      for (const k of keys) pending.add(k);
      scheduleFlush();
    };

    // ---- Conjuntos por contexto (mantidos enxutos) ----------------------
    const AGENDA_CORE = [
      'appointments', 'client-appointments',
      'professionals', 'rooms', 'services', 'business-settings', 'business_settings',
      'professional-absences', 'professional_absences', 'waitlist', 'recurring_appointments',
      'appointment_edit_locks',
      'service_packages', 'client_packages', 'package_appointments', 'package_details',
      'package_appointment_history', 'package_template_steps',
      'dashboard-stats', 'dashboard_stats',
    ] as const;

    const FINANCIAL = [
      'financial_entries', 'financial_categories', 'payment_methods',
      'banks', 'cash_registers', 'cash_transactions', 'cash_register_entries', 'card_brands',
      'card_brand_fees', 'boleto_installments', 'boleto_installments_all',
      'dashboard-stats', 'dashboard_stats', 'goals',
    ] as const;

    const CLIENT = [
      'clients', 'client', 'client_services', 'client_packages',
      'clients_credits', 'client_credits', 'client-appointments',
      'client-sales', 'quotes', 'client-quotes', 'client_documents', 'client-documents',
      'treatment_photos', 'client-photos',
    ] as const;

    const APPOINTMENT = [
      'appointments', 'client-appointments', 'package_appointments',
      'package_appointment_history', 'package_details', 'service_packages',
      'client_packages', 'professional_absences', 'professional-absences',
      'waitlist', 'recurring_appointments',
    ] as const;

    const SERVICE = [
      'services', 'service_packages', 'package_templates',
      'package_template_steps', 'service_products', 'package_template_products',
    ] as const;

    const PRODUCT = [
      'products', 'product_purchases', 'suppliers',
      'service_products', 'appointment_product_consumption',
    ] as const;

    const PACKAGE_SYNC = [
      ...APPOINTMENT, ...SERVICE, ...CLIENT, 'agenda-packages-sync',
    ] as const;

    // ---- Canal único ----------------------------------------------------
    const channel = supabase
      .channel(`realtime-sync-all-v3-${accountOwnerId}`)

      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        invalidateKeys([...AGENDA_CORE, ...APPOINTMENT, ...CLIENT, ...FINANCIAL, 'dashboard-stats']);
        if (payload.eventType === 'INSERT') {
          toast.success('Novo agendamento criado!', { duration: 3000 });
        } else if (payload.eventType === 'UPDATE') {
          const n = payload.new as { payment_status?: string; status?: string };
          if (n.payment_status === 'paid') toast.success('Pagamento confirmado!', { duration: 3000 });
          if (n.status === 'completed') toast.success('Atendimento concluído!', { duration: 3000 });
        } else if (payload.eventType === 'DELETE') {
          toast.info('Agendamento removido', { duration: 2000 });
        }
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        invalidateKeys([...CLIENT, ...APPOINTMENT, 'dashboard-stats']);
        if (payload.eventType === 'INSERT') {
          toast.success('Novo cliente cadastrado!', { duration: 3000 });
        }
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        invalidateKeys([...SERVICE, ...APPOINTMENT, 'dashboard-stats']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_packages' }, (payload) => {
        invalidateKeys([...PACKAGE_SYNC, ...FINANCIAL]);
        if (payload.eventType === 'INSERT') toast.success('Novo pacote criado!', { duration: 3000 });
        else if (payload.eventType === 'DELETE') toast.info('Pacote removido da agenda', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_appointments' }, () => {
        invalidateKeys(PACKAGE_SYNC);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_appointment_history' }, () => {
        invalidateKeys([...APPOINTMENT, ...SERVICE, ...CLIENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_template_steps' }, () => {
        invalidateKeys([...SERVICE, ...APPOINTMENT, ...CLIENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, (payload) => {
        // Vendas afetam agenda + financeiro + clientes + produtos.
        // Antes: invalidateAll() nuclear. Agora: só o que faz sentido.
        invalidateKeys([
          ...FINANCIAL, ...CLIENT, ...PRODUCT,
          'single_sales', 'appointments', 'dashboard-stats',
        ]);
        if (payload.eventType === 'INSERT') {
          toast.success('Nova venda registrada!', { duration: 3000 });
        }
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'boleto_installments' }, () => {
        invalidateKeys([...FINANCIAL, ...CLIENT, 'single_sales', 'reminders']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, () => {
        invalidateKeys([...CLIENT, ...APPOINTMENT, 'dashboard-stats']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, (payload) => {
        invalidateKeys(FINANCIAL);
        if (payload.eventType === 'INSERT') toast.success('Caixa aberto!', { duration: 3000 });
        else if (payload.eventType === 'UPDATE') {
          const n = payload.new as { status?: string };
          if (n.status === 'closed') toast.success('Caixa fechado!', { duration: 3000 });
        }
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () => {
        invalidateKeys([...FINANCIAL, 'dashboard-stats']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, (payload) => {
        invalidateKeys([...FINANCIAL, ...CLIENT, 'dashboard-stats']);
        if (payload.eventType === 'INSERT') toast.info('Nova entrada financeira registrada', { duration: 2000 });
        else if (payload.eventType === 'DELETE') toast.info('Entrada financeira removida', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_categories' }, () => {
        invalidateKeys(['financial_categories', 'financial_entries']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => {
        invalidateKeys(['payment_methods', 'appointments', 'single_sales', 'financial_entries', 'cash_transactions']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'banks' }, () => {
        invalidateKeys(['banks', 'cash_transactions', 'financial_entries']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        invalidateKeys([...PRODUCT, ...FINANCIAL]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_purchases' }, (payload) => {
        invalidateKeys([...PRODUCT, ...FINANCIAL]);
        if (payload.eventType === 'INSERT') toast.info('Nova compra de produto registrada', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_products' }, () => {
        invalidateKeys([...PRODUCT, ...SERVICE]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        invalidateKeys(['suppliers', 'products', 'product_purchases']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => {
        invalidateKeys(['professionals', ...APPOINTMENT, ...SERVICE, ...CLIENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'professional_absences' }, () => {
        invalidateKeys(['professional_absences', 'professional-absences', 'professionals', 'appointments']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        invalidateKeys(['rooms', ...APPOINTMENT, ...SERVICE]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => {
        invalidateKeys(['equipment', 'rooms', 'services']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, (payload) => {
        invalidateKeys(['quotes', ...CLIENT]);
        if (payload.eventType === 'INSERT') toast.info('Novo orçamento criado', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_documents' }, () => {
        invalidateKeys(['client_documents', ...CLIENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'treatment_photos' }, () => {
        invalidateKeys(['treatment_photos', ...CLIENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_templates' }, () => {
        invalidateKeys(['package_templates', ...SERVICE]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_brands' }, () => {
        invalidateKeys(['card_brands', 'card_brand_fees', 'payment_methods']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_brand_fees' }, () => {
        invalidateKeys(['card_brand_fees', 'card_brands']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_templates' }, () => {
        invalidateKeys(['document_templates']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_templates' }, () => {
        invalidateKeys(['whatsapp_templates']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        invalidateKeys(['user_roles', 'professionals']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, () => {
        invalidateKeys(['business_settings', 'business-settings']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => {
        invalidateKeys(['goals', 'dashboard-stats']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
        invalidateKeys(['reminders']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, () => {
        invalidateKeys(['waitlist', 'appointments']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_appointments' }, () => {
        invalidateKeys(['recurring_appointments', 'appointments']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_edit_locks' }, () => {
        invalidateKeys(['appointment_edit_locks']);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_template_products' }, () => {
        invalidateKeys(['package_template_products', ...SERVICE, ...PRODUCT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_product_consumption' }, () => {
        invalidateKeys(['appointment_product_consumption', ...PRODUCT, ...APPOINTMENT]);
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register_entries' }, (payload) => {
        invalidateKeys([...FINANCIAL, 'dashboard-stats']);
        if (payload.eventType === 'INSERT') toast.info('💰 Nova movimentação no caixa', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments_audit' }, (payload) => {
        invalidateKeys([...FINANCIAL, ...CLIENT, ...APPOINTMENT, 'dashboard-stats', 'client_credit_transactions']);
        if (payload.eventType === 'INSERT') toast.success('✅ Pagamento registrado', { duration: 2000 });
      })

      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_credit_transactions' }, (payload) => {
        invalidateKeys(['client_credit_transactions', ...CLIENT, ...FINANCIAL, 'dashboard-stats']);
        if (payload.eventType === 'INSERT') {
          const n = payload.new as { transaction_type?: string };
          if (n.transaction_type === 'credit_used') toast.info('💳 Crédito do cliente utilizado', { duration: 2000 });
          else if (n.transaction_type === 'credit_added') toast.success('💳 Crédito adicionado ao cliente', { duration: 2000 });
        }
      })

      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime sync v3: conectado');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime sync: erro de conexão', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('⏰ Realtime sync: timeout, reconectando...');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, accountOwnerId]);
}
