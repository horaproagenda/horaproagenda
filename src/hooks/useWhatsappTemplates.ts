import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WhatsappTemplate {
  id: string;
  name: string;
  type: 'reminder' | 'birthday' | 'confirmation' | 'follow_up';
  message: string;
  hours_before: number | null;
  send_offset_hours: number | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  professional_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useWhatsappTemplates() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ['whatsapp_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('type', { ascending: true });

      if (error) throw error;
      return data as WhatsappTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Omit<WhatsappTemplate, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .insert({
          ...template,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp_templates'] });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar template: ' + error.message);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WhatsappTemplate> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp_templates'] });
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar template: ' + error.message);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp_templates'] });
      toast.success('Template excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir template: ' + error.message);
    },
  });

  return {
    templates,
    isLoading,
    refetch,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
