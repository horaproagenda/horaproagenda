import { useMemo } from 'react';
import { useProfessionalScopeFlags } from '@/hooks/useProfessionalScopeFlags';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DocumentTemplate } from '@/types';

export function useDocumentTemplates() {
  const queryClient = useQueryClient();
  const { onlyOwnDocuments, professionalId } = useProfessionalScopeFlags();

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

  // Quando o profissional só pode trabalhar com os próprios documentos,
  // a lista mostra apenas os modelos que ele criou.
  const templates = useMemo(() => {
    if (!onlyOwnDocuments) return allTemplates;
    return allTemplates.filter(
      (t) => (t as unknown as { owner_professional_id?: string | null }).owner_professional_id === professionalId,
    );
  }, [allTemplates, onlyOwnDocuments, professionalId]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['document_templates'] });
  };

  return { templates, isLoading, error, refetch };
}