import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Lista COMPLETA de todas as query keys do sistema
const ALL_QUERY_KEYS = [
  // Agenda & Appointments
  'appointments',
  'client-appointments',
  'package_appointments',
  'recurring_appointments',
  'professional_absences',
  'professional-absences',
  'appointment_edit_locks',
  
  // Clients
  'clients',
  'client',
  'client_services',
  'client_packages',
  'clients_credits',
  'client_credits',
  
  // Services & Packages
  'services',
  'service_packages',
  'package_templates',
  'service_products',
  'package_template_products',
  
  // Financial
  'financial_entries',
  'financial_categories',
  'payment_methods',
  'banks',
  'card_brands',
  'card_brand_fees',
  
  // Cash Register
  'cash_registers',
  'cash_transactions',
  
  // Sales
  'sales',
  'single_sales',
  'client-sales',
  
  // Products
  'products',
  'product_purchases',
  'suppliers',
  'appointment_product_consumption',
  
  // Professionals & Staff
  'professionals',
  'rooms',
  'equipment',
  'user_roles',
  
  // Documents & Photos
  'quotes',
  'client_documents',
  'treatment_photos',
  'document_templates',
  
  // Settings & Config
  'business_settings',
  'business-settings',
  'whatsapp_templates',
  'whatsapp_connection',
  
  // Dashboard & Stats
  'dashboard-stats',
  'dashboard_stats',
  'monthly-sales',
  'new-clients',
  'services-distribution',
  'total-clients',
  'daily-cashflow',
  
  // Goals & Reminders
  'goals',
  'reminders',
  
  // Waitlist
  'waitlist',
  
  // Audit
  'audit_logs',
];

/**
 * Hook para atualização global de TODOS os dados do sistema
 * 
 * Força refetch completo de todas as queries do React Query,
 * garantindo que todos os dados estejam sincronizados
 */
export function useGlobalRefresh() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    const toastId = toast.loading('Sincronizando todos os dados...', {
      duration: Infinity,
    });
    
    try {
      // Invalida TODAS as queries de uma vez
      await Promise.all(
        ALL_QUERY_KEYS.map(key => 
          queryClient.invalidateQueries({ 
            queryKey: [key],
            refetchType: 'all',
          })
        )
      );
      
      // Também invalida queries com prefixos compostos
      await queryClient.invalidateQueries({
        predicate: (query) => true, // Invalida ABSOLUTAMENTE todas
        refetchType: 'all',
      });
      
      // Aguarda um pouco para os refetches completarem
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.dismiss(toastId);
      toast.success('Todos os dados foram sincronizados!', {
        duration: 3000,
        icon: '✅',
      });
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      toast.dismiss(toastId);
      toast.error('Erro ao sincronizar alguns dados', {
        duration: 4000,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, isRefreshing]);

  // Refresh silencioso (sem toast de loading)
  const refreshSilent = useCallback(async () => {
    try {
      await queryClient.invalidateQueries({
        predicate: () => true,
        refetchType: 'all',
      });
    } catch (error) {
      console.error('Erro no refresh silencioso:', error);
    }
  }, [queryClient]);

  // Refresh de módulo específico
  const refreshModule = useCallback(async (module: 'agenda' | 'financial' | 'clients' | 'products' | 'services') => {
    const moduleKeys: Record<string, string[]> = {
      agenda: [
        'appointments', 'client-appointments', 'package_appointments',
        'professional_absences', 'professional-absences', 'professionals', 'rooms', 'clients',
        'services', 'service_packages', 'client_packages', 'package_details',
        'business-settings', 'business_settings', 'waitlist', 'recurring_appointments'
        , 'appointment_edit_locks'
      ],
      financial: [
        'financial_entries', 'financial_categories', 'payment_methods',
        'banks', 'card_brands', 'card_brand_fees', 'cash_registers',
        'cash_transactions', 'sales', 'single_sales', 'goals'
      ],
      clients: [
        'clients', 'client', 'client_services', 'client_packages',
        'clients_credits', 'client_credits', 'quotes', 'client_documents',
        'treatment_photos', 'client-appointments', 'client-sales'
      ],
      products: [
        'products', 'product_purchases', 'suppliers', 'service_products',
        'package_template_products', 'appointment_product_consumption'
      ],
      services: [
        'services', 'service_packages', 'package_templates',
        'service_products', 'package_template_products'
      ],
    };

    const keys = moduleKeys[module] || [];
    await Promise.all(
      keys.map(key => 
        queryClient.invalidateQueries({ 
          queryKey: [key],
          refetchType: 'all',
        })
      )
    );
  }, [queryClient]);

  return {
    refreshAll,
    refreshSilent,
    refreshModule,
    isRefreshing,
  };
}
