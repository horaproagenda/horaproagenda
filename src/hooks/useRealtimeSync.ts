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
 * 
 * TABELAS MONITORADAS:
 * - appointments, clients, services, service_packages, package_appointments
 * - single_sales, client_services, cash_registers, cash_transactions
 * - financial_entries, financial_categories, payment_methods
 * - products, product_purchases, service_products, suppliers
 * - professionals, professional_absences, rooms, equipment
 * - quotes, client_documents, treatment_photos
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Função helper para invalidar múltiplas queries
    const invalidateMultiple = (keys: string[]) => {
      keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    };

    // Canal principal para TODAS as tabelas
    const mainChannel = supabase
      .channel('realtime-sync-all')
      
      // ============ APPOINTMENTS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          invalidateMultiple([
            'appointments', 'client-appointments', 'clients', 'client',
            'dashboard-stats', 'financial_entries', 'cash_transactions',
            'service_packages', 'client_packages', 'package_appointments'
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
            'clients', 'client', 'appointments', 'client-appointments',
            'client_services', 'client_packages', 'quotes', 'client-sales',
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
            'services', 'appointments', 'service_packages', 
            'service_products', 'package_templates'
          ]);
        }
      )
      
      // ============ SERVICE PACKAGES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_packages' },
        (payload) => {
          invalidateMultiple([
            'service_packages', 'client_packages', 'appointments',
            'package_appointments', 'clients', 'client', 'sales'
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
            'package_appointments', 'service_packages', 'client_packages',
            'appointments'
          ]);
        }
      )
      
      // ============ SINGLE SALES (CAIXA) ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'single_sales' },
        (payload) => {
          invalidateMultiple([
            'sales', 'single_sales', 'client-sales', 'appointments',
            'client_services', 'clients', 'client', 'cash_transactions',
            'cash_registers', 'financial_entries', 'dashboard-stats'
          ]);
          
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
            'client_services', 'appointments', 'clients', 'client',
            'client-appointments'
          ]);
        }
      )
      
      // ============ CASH REGISTERS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_registers' },
        (payload) => {
          invalidateMultiple([
            'cash_registers', 'cash_transactions', 'financial_entries',
            'dashboard-stats'
          ]);
          
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
            'cash_transactions', 'cash_registers', 'financial_entries',
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
            'financial_entries', 'cash_registers', 'cash_transactions',
            'dashboard-stats', 'clients', 'client'
          ]);
          
          if (payload.eventType === 'INSERT') {
            toast.info('Nova entrada financeira registrada', { duration: 2000 });
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
          invalidateMultiple(['payment_methods', 'appointments', 'single_sales']);
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
          invalidateMultiple([
            'products', 'service_products', 'product_purchases'
          ]);
        }
      )
      
      // ============ PRODUCT PURCHASES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_purchases' },
        (payload) => {
          invalidateMultiple([
            'product_purchases', 'products', 'cash_transactions',
            'financial_entries', 'suppliers'
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
          invalidateMultiple(['service_products', 'products', 'services']);
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
            'professionals', 'appointments', 'services',
            'service_packages', 'professional_absences', 'clients'
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
          invalidateMultiple(['rooms', 'appointments', 'services', 'service_packages']);
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
          invalidateMultiple(['quotes', 'clients', 'client']);
          
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
          invalidateMultiple(['client_documents', 'clients', 'client']);
        }
      )
      
      // ============ TREATMENT PHOTOS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treatment_photos' },
        () => {
          invalidateMultiple(['treatment_photos', 'clients', 'client']);
        }
      )
      
      // ============ PACKAGE TEMPLATES ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_templates' },
        () => {
          invalidateMultiple(['package_templates', 'service_packages']);
        }
      )
      
      // ============ CARD BRANDS ============
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_brands' },
        () => {
          invalidateMultiple(['card_brands', 'card_brand_fees']);
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
      
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime sync: conectado a todas as tabelas');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime sync: erro de conexão');
          toast.error('Erro na sincronização em tempo real', { duration: 5000 });
        }
      });

    return () => {
      supabase.removeChannel(mainChannel);
    };
  }, [queryClient]);
}
