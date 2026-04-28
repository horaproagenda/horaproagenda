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
        .select('id, template_id, service_id, sequence_order, interval_after_days')
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

      return (data || []).map((template: any) => {
        const explicitSteps = (stepsByTemplate.get(template.id) || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
        const fallbackSteps = Array.from({ length: Number(template.total_sessions || 0) }, (_, index) => ({
          id: `${template.id}-fallback-${index + 1}`,
          template_id: template.id,
          service_id: template.service_id || null,
          sequence_order: index + 1,
          interval_after_days: index === Number(template.total_sessions || 0) - 1 ? 0 : Number(template.interval_days || 7),
        }));

        return {
          ...template,
          steps: explicitSteps.length > 0 ? explicitSteps : fallbackSteps,
        };
      }) as PackageTemplate[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['package_templates'] });
  };

  return { templates, isLoading, error, refetch };
}
