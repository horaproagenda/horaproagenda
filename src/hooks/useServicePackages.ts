import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServicePackage } from '@/types';

export function useServicePackages() {
  const queryClient = useQueryClient();

  const { data: packages = [], isLoading, error } = useQuery({
    queryKey: ['service_packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_packages')
        .select(`
          *,
          client:clients (*),
          professional:professionals (*),
          room:rooms (*),
          service:services (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return (data || []) as ServicePackage[];
    },
  });

  const activePackages = packages.filter(p => p.is_active);
  const inactivePackages = packages.filter(p => !p.is_active);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['service_packages'] });
  };

  return { packages, activePackages, inactivePackages, isLoading, error, refetch };
}

export function usePackageAppointments(packageId: string | null) {
  const { data: appointments = [], isLoading, error } = useQuery({
    queryKey: ['package_appointments', packageId],
    queryFn: async () => {
      if (!packageId) return [];
      
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`
          *,
          appointment:appointments (
            *,
            client:clients (*),
            service:services (*)
          )
        `)
        .eq('package_id', packageId)
        .order('session_number', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!packageId,
  });

  return { appointments, isLoading, error };
}
