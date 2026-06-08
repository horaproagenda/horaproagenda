import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Activity, DollarSign, Loader2, Package, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';

interface PoolRow {
  id: string;
  instance_id: string;
  token: string;
  api_url: string | null;
  status: 'free' | 'assigned' | 'disabled';
  assigned_professional_id: string | null;
  monthly_cost_usd: number | null;
  assigned_at: string | null;
  notes: string | null;
}

const FX_KEY = 'super-admin:usd-brl-rate';

export function WhatsappPoolCostPanel() {
  const qc = useQueryClient();
  const [rate, setRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(FX_KEY));
    return Number.isFinite(v) && v > 0 ? v : 5.5;
  });
  const [running, setRunning] = useState(false);
  const [newPool, setNewPool] = useState({ instance_id: '', token: '', api_url: '', notes: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => { localStorage.setItem(FX_KEY, String(rate)); }, [rate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-ultramsg-pool'],
    queryFn: async (): Promise<PoolRow[]> => {
      const { data, error } = await (supabase as any)
        .from('ultramsg_instance_pool')
        .select('id, instance_id, token, api_url, status, assigned_professional_id, monthly_cost_usd, assigned_at, notes')
        .order('status', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PoolRow[];
    },
    staleTime: 15_000,
  });

  // Map of assigned professional IDs → name
  const profIds = useMemo(
    () => (data ?? []).map(r => r.assigned_professional_id).filter(Boolean) as string[],
    [data],
  );
  const { data: profMap } = useQuery({
    queryKey: ['super-admin-pool-profs', profIds.join(',')],
    queryFn: async () => {
      if (profIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from('professionals').select('id, name').in('id', profIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { m[p.id] = p.name; });
      return m;
    },
    enabled: profIds.length > 0,
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const free = rows.filter(r => r.status === 'free').length;
    const assigned = rows.filter(r => r.status === 'assigned').length;
    const disabled = rows.filter(r => r.status === 'disabled').length;
    const monthlyUsd = rows
      .filter(r => r.status !== 'disabled')
      .reduce((s, r) => s + Number(r.monthly_cost_usd ?? 9), 0);
    const monthlyAssignedUsd = rows
      .filter(r => r.status === 'assigned')
      .reduce((s, r) => s + Number(r.monthly_cost_usd ?? 9), 0);
    const utilization = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, free, assigned, disabled, monthlyUsd, monthlyAssignedUsd, utilization };
  }, [data]);

  const runHealthcheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-pool-healthcheck');
      if (error) throw error;
      const r = data as { connected: number; total: number };
      toast.success(`Health check executado: ${r.connected}/${r.total} conectadas`);
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao executar health check');
    } finally {
      setRunning(false);
    }
  };

  const handleAdd = async () => {
    if (!newPool.instance_id.trim() || !newPool.token.trim()) {
      toast.error('Informe instance_id e token.');
      return;
    }
    setAdding(true);
    const { error } = await (supabase as any).from('ultramsg_instance_pool').insert({
      instance_id: newPool.instance_id.trim(),
      token: newPool.token.trim(),
      api_url: newPool.api_url.trim() || null,
      notes: newPool.notes.trim() || null,
      status: 'free',
    });
    setAdding(false);
    if (error) return toast.error('Erro ao adicionar: ' + error.message);
    toast.success('Instância adicionada ao pool.');
    setNewPool({ instance_id: '', token: '', api_url: '', notes: '' });
    void refetch();
  };

  const handleRemove = async (row: PoolRow) => {
    if (row.status === 'assigned') {
      const ok = window.confirm('Esta instância está atribuída a um profissional. Remover vai desconectar o WhatsApp dele. Confirma?');
      if (!ok) return;
      if (row.assigned_professional_id) {
        await supabase.from('professional_whatsapp_credentials')
          .delete().eq('professional_id', row.assigned_professional_id);
      }
    }
    const { error } = await (supabase as any).from('ultramsg_instance_pool').delete().eq('id', row.id);
    if (error) return toast.error('Erro ao remover: ' + error.message);
    toast.success('Removida do pool.');
    void refetch();
    qc.invalidateQueries({ queryKey: ['professional-whatsapp-credentials'] });
  };

  const fmtUsd = (v: number) => `US$ ${v.toFixed(2)}`;
  const fmtBrl = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Pool UltraMsg · Projeção de custos e gestão</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
          </Button>
          <Button size="sm" variant="secondary" onClick={runHealthcheck} disabled={running}>
            <Activity className="h-3 w-3 mr-1" />
            {running ? 'Verificando...' : 'Health check'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando pool...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} hint="instâncias cadastradas" />
            <StatCard label="Livres" value={stats.free} variant="success" hint="disponíveis" />
            <StatCard label="Ocupadas" value={stats.assigned} variant="primary" hint="profissionais conectados" />
            <StatCard label="Desativadas" value={stats.disabled} variant="muted" hint="não cobradas" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Utilização do pool</span>
              <span className="tabular-nums">{stats.utilization}%</span>
            </div>
            <Progress value={stats.utilization} className="h-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3" /> Custo mensal estimado (pool inteiro)
              </div>
              <div className="text-lg font-semibold tabular-nums">{fmtUsd(stats.monthlyUsd)}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ≈ {fmtBrl(stats.monthlyUsd * rate)}
              </div>
            </Card>
            <Card className="p-3 bg-emerald-500/5 border-emerald-500/20">
              <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground mb-1">
                <Zap className="h-3 w-3" /> Custo das instâncias em uso
              </div>
              <div className="text-lg font-semibold tabular-nums">{fmtUsd(stats.monthlyAssignedUsd)}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ≈ {fmtBrl(stats.monthlyAssignedUsd * rate)}
              </div>
            </Card>
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Cotação USD → BRL</Label>
              <Input
                type="number" step="0.01" min="0"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className="h-8 w-32 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground pb-2">
              Custo por instância configurado em <code>monthly_cost_usd</code> (padrão US$ 9,00).
            </p>
          </div>

          {stats.free === 0 && stats.total > 0 && (
            <Badge variant="destructive" className="text-[11px]">
              Pool sem vagas livres — compre novas instâncias UltraMsg para novos profissionais.
            </Badge>
          )}

          {/* Add new instance */}
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">Adicionar nova instância ao pool</p>
            <p className="text-[11px] text-muted-foreground">
              Compre em <code>user.ultramsg.com</code> com a sua conta master e cole abaixo. O custo fica oculto dos clientes do app.
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input
                value={newPool.instance_id}
                onChange={(e) => setNewPool(p => ({ ...p, instance_id: e.target.value }))}
                placeholder="instanceXXXXX"
                className="h-8 text-xs"
              />
              <Input
                value={newPool.token}
                onChange={(e) => setNewPool(p => ({ ...p, token: e.target.value }))}
                placeholder="token UltraMsg"
                className="h-8 text-xs"
                type="password"
              />
              <Input
                value={newPool.notes}
                onChange={(e) => setNewPool(p => ({ ...p, notes: e.target.value }))}
                placeholder="anotação (opcional)"
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={handleAdd} disabled={adding} className="h-8">
                {adding ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Adicionar
              </Button>
            </div>
          </div>

          {/* Pool list */}
          <div className="space-y-1">
            <p className="text-xs font-medium">Instâncias cadastradas ({(data ?? []).length})</p>
            {(data ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Nenhuma instância no pool. Adicione a primeira acima.
              </p>
            ) : (
              <div className="space-y-1">
                {(data ?? []).map((row) => {
                  const profName = row.assigned_professional_id
                    ? profMap?.[row.assigned_professional_id] ?? '—'
                    : null;
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="text-foreground truncate">{row.instance_id}</code>
                        {row.status === 'free' && <Badge variant="outline" className="text-[10px]">livre</Badge>}
                        {row.status === 'assigned' && (
                          <Badge className="bg-green-500 text-[10px]">em uso · {profName}</Badge>
                        )}
                        {row.status === 'disabled' && <Badge variant="destructive" className="text-[10px]">desabilitada</Badge>}
                        {row.notes && <span className="text-muted-foreground truncate">· {row.notes}</span>}
                      </div>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => handleRemove(row)}
                        className="h-7 w-7 text-destructive"
                        title="Remover do pool"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function StatCard({
  label, value, hint, variant = 'default',
}: { label: string; value: number; hint?: string; variant?: 'default' | 'success' | 'primary' | 'muted' }) {
  const cls = {
    default: 'bg-muted/30',
    success: 'bg-emerald-500/10 border-emerald-500/30',
    primary: 'bg-primary/10 border-primary/30',
    muted: 'bg-muted/40 text-muted-foreground',
  }[variant];
  return (
    <Card className={`p-3 ${cls}`}>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}
