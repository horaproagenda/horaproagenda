import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DocumentTemplate } from '@/types';
import { toast } from 'sonner';

export type TemplateCategory = 'anamnese' | 'contract' | 'consent';

export interface TemplateFormData {
  title: string;
  description?: string | null;
  content: string;
  variables?: string[];
  is_active?: boolean;
  category?: TemplateCategory;
}

export function useDocumentTemplatesManagement() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['document_templates_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('title', { ascending: true });
      
      if (error) throw error;
      return data as DocumentTemplate[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const { error, data: newTemplate } = await supabase
        .from('document_templates')
        .insert({
          title: data.title,
          description: data.description || null,
          content: data.content,
          variables: data.variables || [],
          is_active: data.is_active ?? true,
          category: data.category ?? 'anamnese',
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document_templates'] });
      queryClient.invalidateQueries({ queryKey: ['document_templates_all'] });
      toast.success('Modelo criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar modelo: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TemplateFormData }) => {
      const { error } = await supabase
        .from('document_templates')
        .update({
          title: data.title,
          description: data.description || null,
          content: data.content,
          variables: data.variables || [],
          is_active: data.is_active ?? true,
          ...(data.category ? { category: data.category } : {}),
        } as any)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document_templates'] });
      queryClient.invalidateQueries({ queryKey: ['document_templates_all'] });
      toast.success('Modelo atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar modelo: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document_templates'] });
      queryClient.invalidateQueries({ queryKey: ['document_templates_all'] });
      toast.success('Modelo excluído!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir modelo: ' + error.message);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: DocumentTemplate) => {
      const { error, data } = await supabase
        .from('document_templates')
        .insert({
          title: `${template.title} (Cópia)`,
          description: template.description,
          content: template.content,
          variables: template.variables || [],
          is_active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document_templates'] });
      queryClient.invalidateQueries({ queryKey: ['document_templates_all'] });
      toast.success('Modelo duplicado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao duplicar modelo: ' + error.message);
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['document_templates'] });
    queryClient.invalidateQueries({ queryKey: ['document_templates_all'] });
  };

  return { 
    templates, 
    isLoading, 
    error, 
    refetch,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: (id: string, data: TemplateFormData) => updateMutation.mutateAsync({ id, data }),
    deleteTemplate: deleteMutation.mutateAsync,
    duplicateTemplate: duplicateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
