import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClientCredits {
  clientId: string;
  availableServices: number;
  availablePackageSessions: number;
  totalCredits: number;
}

export function useClientCredits(clientId: string | null) {
  return useQuery({
    queryKey: ['client_credits', clientId],
    queryFn: async (): Promise<ClientCredits | null> => {
      if (!clientId) return null;

      // Fetch available services (status = 'available')
      const { data: services, error: servicesError } = await supabase
        .from('client_services')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'available');

      if (servicesError) throw servicesError;

      // Fetch active packages with remaining sessions
      const { data: packages, error: packagesError } = await supabase
        .from('service_packages')
        .select('id, total_sessions, sessions_scheduled')
        .eq('client_id', clientId)
        .eq('is_active', true);

      if (packagesError) throw packagesError;

      const availableServices = services?.length || 0;
      const availablePackageSessions = packages?.reduce((acc, pkg) => {
        const remaining = pkg.total_sessions - pkg.sessions_scheduled;
        return acc + Math.max(0, remaining);
      }, 0) || 0;

      return {
        clientId,
        availableServices,
        availablePackageSessions,
        totalCredits: availableServices + availablePackageSessions,
      };
    },
    enabled: !!clientId,
  });
}

// Batch fetch credits for multiple clients
export function useClientsCredits(clientIds: string[]) {
  return useQuery({
    queryKey: ['clients_credits', clientIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, ClientCredits>> => {
      if (clientIds.length === 0) return new Map();

      // Fetch available services for all clients
      const { data: services, error: servicesError } = await supabase
        .from('client_services')
        .select('id, client_id')
        .in('client_id', clientIds)
        .eq('status', 'available');

      if (servicesError) throw servicesError;

      // Fetch active packages for all clients
      const { data: packages, error: packagesError } = await supabase
        .from('service_packages')
        .select('id, client_id, total_sessions, sessions_scheduled')
        .in('client_id', clientIds)
        .eq('is_active', true);

      if (packagesError) throw packagesError;

      const creditsMap = new Map<string, ClientCredits>();

      // Initialize all clients with zero credits
      clientIds.forEach(clientId => {
        creditsMap.set(clientId, {
          clientId,
          availableServices: 0,
          availablePackageSessions: 0,
          totalCredits: 0,
        });
      });

      // Count services per client
      services?.forEach(service => {
        const credits = creditsMap.get(service.client_id);
        if (credits) {
          credits.availableServices += 1;
          credits.totalCredits += 1;
        }
      });

      // Count package sessions per client
      packages?.forEach(pkg => {
        const credits = creditsMap.get(pkg.client_id!);
        if (credits) {
          const remaining = pkg.total_sessions - pkg.sessions_scheduled;
          const available = Math.max(0, remaining);
          credits.availablePackageSessions += available;
          credits.totalCredits += available;
        }
      });

      return creditsMap;
    },
    enabled: clientIds.length > 0,
  });
}
