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
          room:rooms (*)
        `)
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;

      const templateIds = (data || []).map((template: any) => template.id);
      if (templateIds.length === 0) return [];

      const { data: steps, error: stepsError } = await (supabase as any)
        .from('package_template_steps')
        .select('*')
        .in('template_id', templateIds)
        .order('sequence_order', { ascending: true });

      if (stepsError) {
        console.error('Error fetching package template steps:', stepsError);
      }

      const stepsByTemplate = new Map<string, any[]>();
      (steps || []).forEach((step: any) => {
        const current = stepsByTemplate.get(step.template_id) || [];
        current.push(step);
        stepsByTemplate.set(step.template_id, current);
      });

      return (data || []).map((template: any) => ({
        ...template,
        steps: (stepsByTemplate.get(template.id) || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
      })) as PackageTemplate[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['package_templates'] });
  };

  return { templates, isLoading, error, refetch };
}
