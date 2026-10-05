import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';

export interface ConsultationNote {
  id: string;
  client_id: string;
  appointment_id: string | null;
  raw_notes: string;
  summary: string;
  owner_professional_id: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from('client_consultation_notes');

export function useConsultationNotes(clientId: string) {
  const qc = useQueryClient();
  const key = ['consultation-notes', clientId];

  const { data: notes = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await table().select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConsultationNote[];
    },
  });

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`ccn-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_consultation_notes', filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const save = useMutation({
    mutationFn: async (n: Partial<ConsultationNote> & { raw_notes: string; summary: string }) => {
      if (n.id) {
        const { error } = await table().update({ raw_notes: n.raw_notes, summary: n.summary, appointment_id: n.appointment_id ?? null }).eq('id', n.id);
        if (error) throw error;
      } else {
        const { error } = await table().insert({
          client_id: clientId, raw_notes: n.raw_notes, summary: n.summary,
          appointment_id: n.appointment_id ?? null, owner_professional_id: n.owner_professional_id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Consulta salva na ficha do cliente.'); },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Consulta excluída.'); },
    onError: (e) => toast.error((e as Error).message),
  });

  return { notes, isLoading, save, remove };
}

/** Lê o texto do resumo em streaming. Lança Error com mensagem clara em falhas. */
export async function streamConsultationSummary(
  clientId: string,
  notes: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/summarize-consultation`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ client_id: clientId, notes }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Não foi possível gerar o resumo agora. Tente novamente em instantes.');
  }
  return readSummaryStream(res.body, onDelta);
}

export async function readSummaryStream(body: ReadableStream<Uint8Array>, onDelta: (t: string) => void): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onDelta(full.replace(/\n?\[\[(ERRO|VAZIO)\]\]/g, ''));
  }
  if (full.includes('[[ERRO]]')) throw new Error('A geração do resumo foi interrompida. Tente novamente.');
  if (full.includes('[[VAZIO]]') || !full.trim()) throw new Error('A IA não devolveu um resumo. Revise as observações e tente de novo.');
  return full.trim();
}
