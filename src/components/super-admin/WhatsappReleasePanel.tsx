import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, RefreshCw, MessageSquare, ShieldCheck, Undo2, Loader2 } from 'lucide-react';


/**
 * Painel do Super Admin para liberar/revogar o WhatsApp de usuários
 * SEM visualizar nome, e-mail, account_owner_id ou qualquer PII.
 *
 * A UI trabalha apenas com um "código do pedido" opaco (UUID) + status.
 * Toda operação é feita via RPCs SECURITY DEFINER anônimas:
 *   - super_admin_list_pending_whatsapp_releases()
 *   - super_admin_approve_whatsapp_release(p_request_id)   -- idempotente (advisory lock)
 *   - super_admin_revoke_whatsapp_release(p_request_id)    -- devolve instância ao pool
 */

interface ReleaseRow {
  request_id: string;
  created_at: string;
  approved_at: string | null;
  is_approved: boolean;
  has_pool_instance: boolean;
  free_pool_instances: number;
  email_hint: string | null;
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
  return `#${id.slice(0, 8)}`;
}

export function WhatsappReleasePanel() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-whatsapp-releases-anon'],
    queryFn: async (): Promise<ReleaseRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'super_admin_list_pending_whatsapp_releases',
      );
      if (error) throw error;
      return (data ?? []) as ReleaseRow[];
    },
    staleTime: 10_000,
  });

  useEffect(() => {
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

  const approve = async (row: ReleaseRow) => {
    if (busyId) return;
    setBusyId(row.request_id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'super_admin_approve_whatsapp_release',
        { p_request_id: row.request_id },
      );
      if (error) throw error;
      const res = (data ?? {}) as {
        approved?: boolean;
        already_approved?: boolean;
        free_pool_instances?: number;
      };
      if (res.approved) {
        toast.success(
          `Liberação ${shortCode(row.request_id)} aprovada. ${
            typeof res.free_pool_instances === 'number'
              ? `${res.free_pool_instances} instância(s) livre(s) no pool.`
              : ''
          }`.trim(),
        );
      } else {
        toast.info(`Pedido ${shortCode(row.request_id)} já estava liberado.`);
      }
      qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases-anon'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao aprovar');
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (row: ReleaseRow) => {
    if (busyId) return;
    const ok = window.confirm(
      `Revogar a liberação ${shortCode(
        row.request_id,
      )}? A instância UltraMsg atribuída (se houver) volta ao pool e as credenciais do usuário serão desativadas.`,
    );
    if (!ok) return;
    setBusyId(row.request_id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'super_admin_revoke_whatsapp_release',
        { p_request_id: row.request_id },
      );
      if (error) throw error;
      const res = (data ?? {}) as {
        revoked?: boolean;
        pool_instances_released?: number;
        credentials_deactivated?: number;
        free_pool_instances?: number;
      };
      if (res.revoked) {
        toast.success(
          `Liberação ${shortCode(row.request_id)} revogada. ${
            res.pool_instances_released ?? 0
          } instância(s) devolvida(s), ${res.credentials_deactivated ?? 0} credencial(is) desativada(s).`,
        );
      } else {
        toast.info(`Nada a revogar para ${shortCode(row.request_id)}.`);
      }
      qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases-anon'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao revogar');
    } finally {
      setBusyId(null);
    }
  };

  const rows = data ?? [];
  const freePool = rows[0]?.free_pool_instances ?? 0;
  const pendingCount = rows.filter((r) => !r.is_approved).length;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Liberações de WhatsApp</h2>
          {pendingCount > 0 && <Badge variant="secondary">{pendingCount} pendente(s)</Badge>}
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
          Cada pedido é identificado apenas por um código anônimo. Nome, e-mail, conta e demais
          dados dos usuários <strong>não são exibidos</strong> nesta tela. Ao aprovar, o próprio
          app do usuário reserva a próxima instância livre do pool. A ação de aprovar é
          idempotente (cliques repetidos não liberam instâncias adicionais). A revogação devolve a
          instância ao pool com segurança.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Código</TableHead>
              <TableHead className="text-[11px]">E-mail (parcial)</TableHead>
              <TableHead className="text-[11px]">Solicitado em</TableHead>
              <TableHead className="text-[11px]">Status</TableHead>
              <TableHead className="text-[11px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-xs py-6 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-xs py-6 text-center text-muted-foreground">
                  Nenhum pedido ativo
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const busy = busyId === r.request_id;
              return (
                <TableRow key={r.request_id}>
                  <TableCell className="text-xs font-mono">{shortCode(r.request_id)}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {r.email_hint ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                  <TableCell className="text-xs">
                    {r.is_approved ? (
                      <Badge variant="default" className="text-[10px]">
                        Liberado {r.has_pool_instance ? '· instância no ar' : '· aguardando pool'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Pendente
                      </Badge>
                    )}
                    {r.approved_at && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        em {fmt(r.approved_at)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.is_approved ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revoke(r)}
                        disabled={busy}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        {busy ? 'Revogando...' : 'Revogar'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => approve(r)}
                        disabled={busy || freePool === 0}
                        title={
                          freePool === 0 ? 'Adicione instâncias ao pool antes de liberar' : ''
                        }
                        className="bg-primary hover:bg-primary"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        {busy ? 'Aprovando...' : 'Liberar'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
