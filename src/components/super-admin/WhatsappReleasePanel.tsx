import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { CheckCircle2, RefreshCw, MessageSquare, ShieldCheck } from 'lucide-react';

/**
 * Painel do Super Admin para liberar o WhatsApp de novos usuários
 * SEM visualizar nome, e-mail ou qualquer dado cadastrado por eles.
 *
 * A UI trabalha apenas com um "código do pedido" opaco (UUID) e a data/hora.
 * Toda a operação é feita via RPCs SECURITY DEFINER:
 *   - super_admin_list_pending_whatsapp_releases()
 *   - super_admin_approve_whatsapp_release(p_request_id)
 * que retornam somente dados anônimos e verificam o papel super_admin.
 */

interface PendingRelease {
  request_id: string;
  created_at: string;
  free_pool_instances: number;
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '—';
  }
}

function shortCode(id: string) {
  // Exibe só um trecho curto do UUID para facilitar leitura ("#a1b2c3d4").
  return `#${id.slice(0, 8)}`;
}

export function WhatsappReleasePanel() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-whatsapp-releases-anon'],
    queryFn: async (): Promise<PendingRelease[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'super_admin_list_pending_whatsapp_releases',
      );
      if (error) throw error;
      return (data ?? []) as PendingRelease[];
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    // Revalida quando qualquer profissional novo aparece; não lê PII da tabela.
    const ch = supabase
      .channel('super-admin-whatsapp-release-anon-rt')
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: 'professionals' } as any,
        () => qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases-anon'] }),
      )
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: 'ultramsg_instance_pool' } as any,
        () => qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases-anon'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const approve = async (row: PendingRelease) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'super_admin_approve_whatsapp_release',
        { p_request_id: row.request_id },
      );
      if (error) throw error;
      const approved = (data as { approved?: boolean } | null)?.approved;
      const freeLeft = (data as { free_pool_instances?: number } | null)?.free_pool_instances;
      if (approved) {
        toast.success(
          `Liberação ${shortCode(row.request_id)} aprovada. ${
            typeof freeLeft === 'number' ? `${freeLeft} instância(s) livre(s) no pool.` : ''
          }`.trim(),
        );
      } else {
        toast.info('Este pedido já estava liberado.');
      }
      qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases-anon'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao aprovar');
    }
  };

  const rows = data ?? [];
  const freePool = rows[0]?.free_pool_instances ?? 0;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Liberações de WhatsApp pendentes</h2>
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={freePool > 0 ? 'default' : 'destructive'} className="text-[10px]">
            Pool UltraMsg livre: {freePool}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          Você libera cada pedido usando apenas um código anônimo. Nome, e-mail, clientes,
          agendamentos e demais dados dos usuários <strong>não são exibidos</strong> nesta tela —
          a privacidade da conta do profissional é preservada. Ao clicar em "Liberar", o próprio
          aplicativo do usuário reserva automaticamente a próxima instância disponível do pool
          UltraMsg.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Código do pedido</TableHead>
              <TableHead className="text-[11px]">Solicitado em</TableHead>
              <TableHead className="text-[11px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-xs py-6 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-xs py-6 text-center text-muted-foreground">
                  Nenhuma liberação pendente
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.request_id}>
                <TableCell className="text-xs font-mono">{shortCode(r.request_id)}</TableCell>
                <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => approve(r)}
                    disabled={freePool === 0}
                    title={freePool === 0 ? 'Adicione instâncias ao pool antes de liberar' : ''}
                    className="bg-primary hover:bg-primary"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Liberar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
