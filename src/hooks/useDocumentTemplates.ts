import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DocumentTemplate } from '@/types';

export function useDocumentTemplates() {
  const queryClient = useQueryClient();
  const { data: allTemplates = [], isLoading, error } = useQuery({
    queryKey: ['document_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('is_active', true)
        .order('title', { ascending: true });
      
      if (error) throw error;
      return data as DocumentTemplate[];
    },
  });

  // A seleção já chega filtrada pela RLS: próprios + gerais autorizados.
  const templates = allTemplates;

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['document_templates'] });
  };

  return { templates, isLoading, error, refetch };
}