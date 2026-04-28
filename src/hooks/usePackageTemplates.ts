import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PackageTemplate } from '@/types';

export function usePackageTemplates() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['package_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_templates')
        .select(`
          *,
          professional:professionals (*),
          room:rooms (*),
          steps:package_template_steps (
            *,
            service:services (*)
          )
        `)
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      return (data || []).map((template: any) => ({
        ...template,
        steps: (template.steps || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
      })) as PackageTemplate[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['package_templates'] });
  };

  return { templates, isLoading, error, refetch };
}
