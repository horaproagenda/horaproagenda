import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DocumentPrefillSnapshot } from '@/lib/documentTemplateFields';

export interface DocumentFillLink {
  id: string;
  template_id: string;
  client_id: string | null;
  professional_id: string | null;
  token: string;
  expires_at: string | null;
  filled_at: string | null;
  filled_content: string | null;
  filled_variables: Record<string, unknown>;
  status: 'pending' | 'filled' | 'expired';
  created_at: string;
  updated_at: string;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function useDocumentFillLinks(templateId?: string) {
  const queryClient = useQueryClient();

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['document_fill_links', templateId],
    queryFn: async () => {
      let query = supabase
        .from('document_fill_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (templateId) {
        query = query.eq('template_id', templateId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DocumentFillLink[];
    },
    enabled: !!templateId,
  });

  const createLink = async (
    templateId: string,
    options?: {
      clientId?: string;
      professionalId?: string;
      expiresInDays?: number;
      prefillSnapshot?: DocumentPrefillSnapshot;
    }
  ): Promise<{ url: string; token: string } | null> => {
    try {
      const token = generateToken();
      const expiresAt = options?.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const filledVariables = options?.prefillSnapshot
        ? { __prefill: options.prefillSnapshot }
        : {};

      const { error } = await supabase
        .from('document_fill_links')
        .insert({
          template_id: templateId,
          client_id: options?.clientId || null,
          professional_id: options?.professionalId || null,
          token,
          expires_at: expiresAt,
          status: 'pending',
          filled_variables: filledVariables,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['document_fill_links'] });

      const baseUrl = window.location.origin;
      const url = `${baseUrl}/preencher-documento?token=${token}`;

      toast.success('Link gerado com sucesso!');
      return { url, token };
    } catch (error) {
      console.error('Error creating link:', error);
      toast.error('Erro ao gerar link');
      return null;
    }
  };

  const deleteLink = async (id: string) => {
    try {
      const { error } = await supabase
        .from('document_fill_links')
        .delete()
        .eq('id', id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['document_fill_links'] });
      toast.success('Link removido');
    } catch (error) {
      console.error('Error deleting link:', error);
      toast.error('Erro ao remover link');
    }
  };

  return {
    links,
    isLoading,
    createLink,
    deleteLink,
  };
}
