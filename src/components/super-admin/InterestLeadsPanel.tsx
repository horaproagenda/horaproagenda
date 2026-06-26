import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { CheckCircle2, Trash2, Mail, Phone, RefreshCw, Inbox } from 'lucide-react';

interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  message: string | null;
  created_at: string;
  contacted_at: string | null;
  contacted_by: string | null;
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
}

export function InterestLeadsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-interest-leads'],
    queryFn: async (): Promise<LeadRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('interest_leads')
        .select('id,name,email,whatsapp,message,created_at,contacted_at,contacted_by')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
    staleTime: 10_000,
  });

  // Realtime: atualiza automaticamente quando um lead chega ou é apagado pelo trigger.
  useEffect(() => {
    const ch = supabase
      .channel('super-admin-interest-leads-rt')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interest_leads' } as any,
        () => qc.invalidateQueries({ queryKey: ['super-admin-interest-leads'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const markContacted = async (row: LeadRow) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('interest_leads')
        .update({ contacted_at: new Date().toISOString(), contacted_by: u.user?.id ?? null })
        .eq('id', row.id);
      if (error) throw error;
      toast.success('Lead marcado como contatado');
      qc.invalidateQueries({ queryKey: ['super-admin-interest-leads'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar');
    }
  };

  const removeLead = async (row: LeadRow) => {
    if (!confirm(`Excluir o lead de ${row.name ?? row.email}?`)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('interest_leads').delete().eq('id', row.id);
      if (error) throw error;
      toast.success('Lead excluído');
      qc.invalidateQueries({ queryKey: ['super-admin-interest-leads'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  };

  const rows = data ?? [];
  const pending = rows.filter(r => !r.contacted_at).length;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Leads do formulário "Tenho interesse"</h2>
          {pending > 0 && <Badge variant="secondary">{pending} pendente{pending > 1 ? 's' : ''}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Os leads são removidos automaticamente desta lista quando a pessoa cria a conta no aplicativo com o mesmo e-mail.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Nome</TableHead>
              <TableHead className="text-[11px]">Contato</TableHead>
              <TableHead className="text-[11px]">Mensagem</TableHead>
              <TableHead className="text-[11px]">Recebido</TableHead>
              <TableHead className="text-[11px]">Status</TableHead>
              <TableHead className="text-[11px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-xs py-6 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-xs py-6 text-center text-muted-foreground">Nenhum lead recebido ainda</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-medium">{r.name ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-col gap-0.5">
                    {r.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>}
                    {r.whatsapp && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.whatsapp}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-xs max-w-[260px]">
                  <span className="line-clamp-2 text-muted-foreground">{r.message || '—'}</span>
                </TableCell>
                <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                <TableCell className="text-xs">
                  {r.contacted_at
                    ? <Badge className="bg-green-100 text-green-800">Contatado em {fmt(r.contacted_at)}</Badge>
                    : <Badge variant="secondary">Pendente</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {!r.contacted_at && (
                      <Button size="sm" variant="outline" onClick={() => markContacted(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Já entrei em contato
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => removeLead(r)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
