import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Hook para sincronização em tempo real COMPLETA entre todas as tabelas
 * 
 * ARQUITETURA:
 * - Usa Supabase Realtime (WebSocket) para detectar mudanças no banco
 * - Invalida cache do React Query → dispara refetch automático
 * - Latência típica: 50-200ms
 * - REFETCH AGRESSIVO: Invalida TODAS as queries relacionadas imediatamente
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastRefresh = 0;
    
    // Função para invalidar TUDO de forma agressiva (throttled)
    const invalidateAll = () => {
      const now = Date.now();
      if (now - lastRefresh < 500) return;
      lastRefresh = now;
      
      queryClient.invalidateQueries({
        predicate: () => true,
        refetchType: 'all',
      });
    };

    // Função helper para invalidar múltiplas queries específicas
    const invalidateMultiple = (keys: string[]) => {
      keys.forEach(key => {
        queryClient.invalidateQueries({ 
          queryKey: [key],
          refetchType: 'all',
        });
      });
    };

    // Conjuntos de queries por contexto
    const FINANCIAL_QUERIES = [
      'financial_entries', 'financial_categories', 'payment_methods',
      'banks', 'cash_registers', 'cash_transactions', 'card_brands',
      'card_brand_fees', 'dashboard-stats', 'goals'
    ];
    
    const CLIENT_QUERIES = [
      'clients', 'client', 'client_services', 'client_packages',
      'clients_credits', 'client_credits', 'client-appointments',
      'client-sales', 'quotes', 'client_documents', 'treatment_photos'
    ];
    
    const APPOINTMENT_QUERIES = [
      'appointments', 'client-appointments', 'package_appointments',
      'package_appointment_history', 'package_details', 'service_packages',
      'client_packages', 'professional_absences', 'waitlist', 'recurring_appointments'
    ];
    
    const SERVICE_QUERIES = [
      'services', 'service_packages', 'package_templates',
      'package_template_steps', 'service_products', 'package_template_products'
    ];
    
    const PRODUCT_QUERIES = [
      'products', 'product_purchases', 'suppliers',
      'service_products', 'appointment_product_consumption'
    ];

    // Canal principal para TODAS as tabelas
    const mainChannel = supabase
      .channel('realtime-sync-all-v2')
      
      // ============ APPOINTMENTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          invalidateMultiple([
            ...APPOINTMENT_QUERIES,
            ...CLIENT_QUERIES,
            ...FINANCIAL_QUERIES,
            'dashboard-stats'
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.success('Novo agendamento criado!', { duration: 3000 });
          } else if (payload.eventType === 'UPDATE') {
            const newData = payload.new as { payment_status?: string; status?: string };
            if (newData.payment_status === 'paid') {
              toast.success('Pagamento confirmado!', { duration: 3000 });
            }
            if (newData.status === 'completed') {
              toast.success('Atendimento concluído!', { duration: 3000 });
            }
          } else if (payload.eventType === 'DELETE') {
            toast.info('Agendamento removido', { duration: 2000 });
          }
        }
      )
      
      // ============ CLIENTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        (payload) => {
          invalidateMultiple([
            ...CLIENT_QUERIES,
            ...APPOINTMENT_QUERIES,
            'dashboard-stats'
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.success('Novo cliente cadastrado!', { duration: 3000 });
          }
        }
      )
      
      // ============ SERVICES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services' },
        () => {
          invalidateMultiple([
            ...SERVICE_QUERIES,
            ...APPOINTMENT_QUERIES,
            'dashboard-stats'
          ]);
        }
      )
      
      // ============ SERVICE PACKAGES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_packages' },
        (payload) => {
          invalidateMultiple([
            ...SERVICE_QUERIES,
            ...APPOINTMENT_QUERIES,
            ...CLIENT_QUERIES,
            ...FINANCIAL_QUERIES
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.success('Novo pacote criado!', { duration: 3000 });
          }
        }
      )
      
      // ============ PACKAGE APPOINTMENTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_appointments' },
        () => {
          invalidateMultiple([
            ...APPOINTMENT_QUERIES,
            ...SERVICE_QUERIES,
            ...CLIENT_QUERIES
          ]);
        }
      )

      // ============ PACKAGE APPOINTMENT HISTORY ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_appointment_history' },
        () => {
          invalidateMultiple([
            ...APPOINTMENT_QUERIES,
            ...SERVICE_QUERIES,
            ...CLIENT_QUERIES
          ]);
        }
      )

      // ============ PACKAGE TEMPLATE STEPS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_template_steps' },
        () => {
          invalidateMultiple([
            ...SERVICE_QUERIES,
            ...APPOINTMENT_QUERIES,
            ...CLIENT_QUERIES
          ]);
        }
      )
      
      // ============ SINGLE SALES (CAIXA) ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'single_sales' },
        (payload) => {
          invalidateAll();
          
          if (payload.eventType === 'INSERT') {
            toast.success('Nova venda registrada!', { duration: 3000 });
          }
        }
      )
      
      // ============ CLIENT SERVICES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_services' },
        () => {
          invalidateMultiple([
            ...CLIENT_QUERIES,
            ...APPOINTMENT_QUERIES,
            'dashboard-stats'
          ]);
        }
      )
      
      // ============ CASH REGISTERS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_registers' },
        (payload) => {
          invalidateMultiple(FINANCIAL_QUERIES);
          
          if (payload.eventType === 'INSERT') {
            toast.success('Caixa aberto!', { duration: 3000 });
          } else if (payload.eventType === 'UPDATE') {
            const newData = payload.new as { status?: string };
            if (newData.status === 'closed') {
              toast.success('Caixa fechado!', { duration: 3000 });
            }
          }
        }
      )
      
      // ============ CASH TRANSACTIONS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_transactions' },
        () => {
          invalidateMultiple([
            ...FINANCIAL_QUERIES,
            'dashboard-stats'
          ]);
        }
      )
      
      // ============ FINANCIAL ENTRIES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financial_entries' },
        (payload) => {
          invalidateMultiple([
            ...FINANCIAL_QUERIES,
            ...CLIENT_QUERIES,
            'dashboard-stats'
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.info('Nova entrada financeira registrada', { duration: 2000 });
          } else if (payload.eventType === 'DELETE') {
            toast.info('Entrada financeira removida', { duration: 2000 });
          }
        }
      )
      
      // ============ FINANCIAL CATEGORIES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financial_categories' },
        () => {
          invalidateMultiple(['financial_categories', 'financial_entries']);
        }
      )
      
      // ============ PAYMENT METHODS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods' },
        () => {
          invalidateMultiple([
            'payment_methods', 'appointments', 'single_sales',
            'financial_entries', 'cash_transactions'
          ]);
        }
      )
      
      // ============ BANKS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'banks' },
        () => {
          invalidateMultiple(['banks', 'cash_transactions', 'financial_entries']);
        }
      )
      
      // ============ PRODUCTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          invalidateMultiple(PRODUCT_QUERIES);
        }
      )
      
      // ============ PRODUCT PURCHASES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_purchases' },
        (payload) => {
          invalidateMultiple([
            ...PRODUCT_QUERIES,
            ...FINANCIAL_QUERIES
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.info('Nova compra de produto registrada', { duration: 2000 });
          }
        }
      )
      
      // ============ SERVICE PRODUCTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_products' },
        () => {
          invalidateMultiple([...PRODUCT_QUERIES, ...SERVICE_QUERIES]);
        }
      )
      
      // ============ SUPPLIERS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers' },
        () => {
          invalidateMultiple(['suppliers', 'products', 'product_purchases']);
        }
      )
      
      // ============ PROFESSIONALS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professionals' },
        () => {
          invalidateMultiple([
            'professionals', ...APPOINTMENT_QUERIES,
            ...SERVICE_QUERIES, ...CLIENT_QUERIES
          ]);
        }
      )
      
      // ============ PROFESSIONAL ABSENCES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professional_absences' },
        () => {
          invalidateMultiple(['professional_absences', 'professionals', 'appointments']);
        }
      )
      
      // ============ ROOMS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => {
          invalidateMultiple(['rooms', ...APPOINTMENT_QUERIES, ...SERVICE_QUERIES]);
        }
      )
      
      // ============ EQUIPMENT ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment' },
        () => {
          invalidateMultiple(['equipment', 'rooms', 'services']);
        }
      )
      
      // ============ QUOTES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes' },
        (payload) => {
          invalidateMultiple(['quotes', ...CLIENT_QUERIES]);
          
          if (payload.eventType === 'INSERT') {
            toast.info('Novo orçamento criado', { duration: 2000 });
          }
        }
      )
      
      // ============ CLIENT DOCUMENTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_documents' },
        () => {
          invalidateMultiple(['client_documents', ...CLIENT_QUERIES]);
        }
      )
      
      // ============ TREATMENT PHOTOS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treatment_photos' },
        () => {
          invalidateMultiple(['treatment_photos', ...CLIENT_QUERIES]);
        }
      )
      
      // ============ PACKAGE TEMPLATES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_templates' },
        () => {
          invalidateMultiple(['package_templates', ...SERVICE_QUERIES]);
        }
      )
      
      // ============ CARD BRANDS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_brands' },
        () => {
          invalidateMultiple(['card_brands', 'card_brand_fees', 'payment_methods']);
        }
      )
      
      // ============ CARD BRAND FEES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_brand_fees' },
        () => {
          invalidateMultiple(['card_brand_fees', 'card_brands']);
        }
      )
      
      // ============ DOCUMENT TEMPLATES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_templates' },
        () => {
          invalidateMultiple(['document_templates']);
        }
      )
      
      // ============ WHATSAPP TEMPLATES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_templates' },
        () => {
          invalidateMultiple(['whatsapp_templates']);
        }
      )
      
      // ============ USER ROLES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles' },
        () => {
          invalidateMultiple(['user_roles', 'professionals']);
        }
      )
      
      // ============ BUSINESS SETTINGS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_settings' },
        () => {
          invalidateMultiple(['business_settings']);
          toast.info('Configurações atualizadas', { duration: 2000 });
        }
      )
      
      // ============ GOALS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals' },
        () => {
          invalidateMultiple(['goals', 'dashboard-stats']);
        }
      )
      
      // ============ REMINDERS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders' },
        () => {
          invalidateMultiple(['reminders']);
        }
      )
      
      // ============ WAITLIST ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waitlist' },
        () => {
          invalidateMultiple(['waitlist']);
        }
      )
      
      // ============ PACKAGE TEMPLATE PRODUCTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_template_products' },
        () => {
          invalidateMultiple(['package_template_products', ...SERVICE_QUERIES, ...PRODUCT_QUERIES]);
        }
      )
      
      // ============ APPOINTMENT PRODUCT CONSUMPTION ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointment_product_consumption' },
        () => {
          invalidateMultiple(['appointment_product_consumption', ...PRODUCT_QUERIES, ...APPOINTMENT_QUERIES]);
        }
      )
      
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime sync v2: conectado a todas as tabelas');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime sync: erro de conexão', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('⏰ Realtime sync: timeout, reconectando...');
        } else if (status === 'CLOSED') {
          console.log('🔌 Realtime sync: canal fechado');
        }
      });

    return () => {
      supabase.removeChannel(mainChannel);
    };
  }, [queryClient]);
}
