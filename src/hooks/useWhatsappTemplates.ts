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
  include_confirmation_buttons?: boolean;
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
      return data as WhatsappTemplate;
    },
    onMutate: async (template) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp_templates'] });
      const previous = queryClient.getQueryData<WhatsappTemplate[]>(['whatsapp_templates']) ?? [];
      const optimistic: WhatsappTemplate = {
        ...(template as any),
        id: `optimistic-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<WhatsappTemplate[]>(['whatsapp_templates'], [...previous, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (data, _vars, ctx) => {
      // Substitui a linha otimista pela real, sem refetch (evita esperar 20s+ de refresh global).
      queryClient.setQueryData<WhatsappTemplate[]>(['whatsapp_templates'], (old = []) => {
        const filtered = old.filter((t) => t.id !== ctx?.optimisticId);
        return [...filtered, data];
      });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: any, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['whatsapp_templates'], ctx.previous);
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
      return data as WhatsappTemplate;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp_templates'] });
      const previous = queryClient.getQueryData<WhatsappTemplate[]>(['whatsapp_templates']) ?? [];
      queryClient.setQueryData<WhatsappTemplate[]>(['whatsapp_templates'], (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...(updates as any), updated_at: new Date().toISOString() } : t))
      );
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<WhatsappTemplate[]>(['whatsapp_templates'], (old = []) =>
        old.map((t) => (t.id === data.id ? data : t))
      );
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error: any, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['whatsapp_templates'], ctx.previous);
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
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp_templates'] });
      const previous = queryClient.getQueryData<WhatsappTemplate[]>(['whatsapp_templates']) ?? [];
      queryClient.setQueryData<WhatsappTemplate[]>(['whatsapp_templates'], (old = []) =>
        old.filter((t) => t.id !== id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Template excluído com sucesso!');
    },
    onError: (error: any, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['whatsapp_templates'], ctx.previous);
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
