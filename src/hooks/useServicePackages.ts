import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServicePackage, PackageItem, Service } from '@/types';

export function useServicePackages() {
  const queryClient = useQueryClient();

  const { data: packages = [], isLoading, error } = useQuery({
    queryKey: ['service_packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_packages')
        .select(`
          *,
          package_items (
            *,
            service:services (*)
          )
        `)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((pkg: any) => ({
        ...pkg,
        items: pkg.package_items?.map((item: any) => ({
          ...item,
          service: item.service,
        })) || [],
      })) as ServicePackage[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['service_packages'] });
  };

  return { packages, isLoading, error, refetch };
}