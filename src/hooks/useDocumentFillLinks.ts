import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buildDocumentFieldSchema, type DocumentPrefillSnapshot } from '@/lib/documentTemplateFields';

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

function slugify(value: string, fallback = 'documento'): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function buildFriendlyDocumentSlug(clientName?: string, documentTitle?: string): string {
  const clientSlug = slugify(clientName || '', 'cliente');
  const documentSlug = slugify(documentTitle || '', 'documento');
  return `${clientSlug}-${documentSlug}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
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
      clientName?: string;
      documentTitle?: string;
      professionalId?: string;
      expiresInDays?: number;
      prefillSnapshot?: DocumentPrefillSnapshot;
    }
  ): Promise<{ url: string; token: string; reused?: boolean } | null> => {
    try {
      // Bloqueio: só permitir um link ativo (pendente e não vencido) por modelo+cliente.
      // Se houver um link vigente, retorna o existente em vez de gerar outro.
      if (options?.clientId) {
        // A coluna do código do link é protegida: lemos só os dados públicos
        // e buscamos o código pela função segura do servidor.
        const { data: existing, error: existingError } = await supabase
          .from('document_fill_links')
          .select('id, status, expires_at, filled_at')
          .eq('template_id', templateId)
          .eq('client_id', options.clientId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (existingError) throw existingError;

        const now = Date.now();
        const active = (existing || []).find((l) => {
          if (l.filled_at) return false;
          if (!l.expires_at) return true;
          return new Date(l.expires_at).getTime() > now;
        });

        if (active) {
          const { data: activeToken } = await supabase.rpc('get_document_fill_link_token' as any, { _link_id: active.id });
          if (typeof activeToken === 'string' && activeToken) {
            const baseUrl = window.location.origin.includes('lovable') ? 'https://horaproagenda.app' : window.location.origin;
            const friendlySlug = buildFriendlyDocumentSlug(options?.clientName, options?.documentTitle);
            const url = `${baseUrl}/preencher-documento/${friendlySlug}?token=${activeToken}`;
            toast.info('Já existe um link ativo para este documento e cliente. Reutilizando o link atual.');
            return { url, token: activeToken, reused: true };
          }
        }
      }

      // Lista oficial de campos do modelo (congelada no link junto com a versão).
      const { data: tpl, error: tplError } = await supabase
        .from('document_templates')
        .select('content')
        .eq('id', templateId)
        .maybeSingle();
      if (tplError) throw tplError;
      let fieldSchema;
      try {
        fieldSchema = buildDocumentFieldSchema(tpl?.content || '');
      } catch {
        toast.error('Este modelo tem campos repetidos. Revise o modelo antes de enviar o link.');
        return null;
      }

      const token = generateToken();
      const expiresAt = options?.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const filledVariables: Record<string, unknown> = options?.prefillSnapshot
        ? { __prefill: options.prefillSnapshot }
        : {};

      const { error } = await supabase
        .from('document_fill_links')
        .insert([{
          template_id: templateId,
          client_id: options?.clientId || null,
          professional_id: options?.professionalId || null,
          token,
          expires_at: expiresAt,
          status: 'pending',
          filled_variables: filledVariables as unknown as Record<string, never>,
          template_snapshot: { fields: fieldSchema },
        } as any]);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['document_fill_links'] });

      const baseUrl = window.location.origin.includes('lovable') ? 'https://horaproagenda.app' : window.location.origin;
      const friendlySlug = buildFriendlyDocumentSlug(options?.clientName, options?.documentTitle);
      const url = `${baseUrl}/preencher-documento/${friendlySlug}?token=${token}`;

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
