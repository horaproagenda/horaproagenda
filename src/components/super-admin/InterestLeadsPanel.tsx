import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
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

      {isLoading ? (
        <div className="text-xs py-6 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <ResponsiveTable
          data={rows}
          getRowKey={(r) => r.id}
          minWidthClassName="min-w-[840px]"
          emptyMessage="Nenhum lead recebido ainda"
          columns={[
            {
              key: 'name',
              header: 'Nome',
              priority: 'primary',
              className: 'text-xs font-medium',
              headClassName: 'text-[11px]',
              cell: (r) => r.name ?? '—',
            },
            {
              key: 'status',
              header: 'Status',
              priority: 'primary',
              hideLabelOnCard: true,
              className: 'text-xs',
              headClassName: 'text-[11px]',
              cell: (r) =>
                r.contacted_at ? (
                  <Badge className="bg-primary/10 text-primary">Contatado em {fmt(r.contacted_at)}</Badge>
                ) : (
                  <Badge variant="secondary">Pendente</Badge>
                ),
            },
            {
              key: 'contact',
              header: 'Contato',
              priority: 'secondary',
              className: 'text-xs',
              headClassName: 'text-[11px]',
              cell: (r) => (
                <div className="flex flex-col gap-0.5">
                  {r.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {r.email}
                    </span>
                  )}
                  {r.whatsapp && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {r.whatsapp}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'message',
              header: 'Mensagem',
              priority: 'secondary',
              className: 'text-xs max-w-[260px]',
              headClassName: 'text-[11px]',
              cell: (r) => <span className="line-clamp-2 text-muted-foreground">{r.message || '—'}</span>,
            },
            {
              key: 'created_at',
              header: 'Recebido',
              priority: 'secondary',
              className: 'text-xs',
              headClassName: 'text-[11px]',
              cell: (r) => fmt(r.created_at),
            },
            {
              key: 'actions',
              header: 'Ações',
              priority: 'actions',
              headClassName: 'text-[11px] text-right',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  {!r.contacted_at && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6"
                      title="Já entrei em contato"
                      aria-label="Já entrei em contato"
                      onClick={() => markContacted(r)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-6 w-6"
                    title="Excluir"
                    aria-label="Excluir"
                    onClick={() => removeLead(r)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
