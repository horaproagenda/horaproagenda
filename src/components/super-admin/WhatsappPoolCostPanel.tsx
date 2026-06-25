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
import {
  Activity, ChevronDown, ChevronUp, DollarSign, Info, Loader2, Package, Pencil, Plus,
  RefreshCw, Tags, Trash2, Zap,
} from 'lucide-react';

interface PoolRow {
  id: string;
  instance_id: string;
  token: string;
  api_url: string | null;
  status: 'free' | 'assigned' | 'disabled';
  assigned_professional_id: string | null;
  monthly_cost_usd: number | null;
  assigned_at: string | null;
  activated_at: string | null;
  notes: string | null;
}

interface TierRow {
  id: string;
  min_quantity: number;
  max_quantity: number | null;
  unit_price_usd: number;
  active: boolean;
}

const FX_KEY = 'super-admin:usd-brl-rate';

function priceForQty(tiers: TierRow[], qty: number): TierRow | null {
  const active = tiers.filter(t => t.active);
  // Find the tier whose range contains qty
  const exact = active.find(
    t => qty >= t.min_quantity && (t.max_quantity == null || qty <= t.max_quantity),
  );
  if (exact) return exact;
  // Fallback to the highest tier <= qty
  return active
    .filter(t => qty >= t.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity)[0] ?? null;
}

export function WhatsappPoolCostPanel() {
  const qc = useQueryClient();
  const [rate, setRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(FX_KEY));
    return Number.isFinite(v) && v > 0 ? v : 5.5;
  });
  const [running, setRunning] = useState(false);
  const [newPool, setNewPool] = useState({ instance_id: '', token: '', api_url: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [showTiers, setShowTiers] = useState(false);

  useEffect(() => { localStorage.setItem(FX_KEY, String(rate)); }, [rate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-ultramsg-pool'],
    queryFn: async (): Promise<PoolRow[]> => {
      const { data, error } = await (supabase as any)
        .from('ultramsg_instance_pool')
        .select('id, instance_id, token, api_url, status, assigned_professional_id, monthly_cost_usd, assigned_at, activated_at, notes')
        .order('status', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PoolRow[];
    },
    staleTime: 15_000,
  });

  const { data: tiers, refetch: refetchTiers } = useQuery({
    queryKey: ['super-admin-whatsapp-tiers'],
    queryFn: async (): Promise<TierRow[]> => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_volume_pricing_tiers')
        .select('id, min_quantity, max_quantity, unit_price_usd, active')
        .order('min_quantity', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TierRow[];
    },
    staleTime: 30_000,
  });

  // Realtime: refresh on pool / tier changes
  useEffect(() => {
    const ch = supabase
      .channel('super-admin-whatsapp-billing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ultramsg_instance_pool' },
        () => { void refetch(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_volume_pricing_tiers' },
        () => { void refetchTiers(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch, refetchTiers]);

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
    const tier = priceForQty(tiers ?? [], assigned);
    const unitPrice = tier ? Number(tier.unit_price_usd) : 9;
    const billedUsd = assigned * unitPrice;
    const utilization = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, free, assigned, disabled, billedUsd, utilization, tier, unitPrice };
  }, [data, tiers]);

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
    toast.success('Instância adicionada ao pool (sem custo até ser vinculada).');
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
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso));
    } catch { return '—'; }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Instâncias UltraMsg · Cobrança sob demanda</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
          </Button>
          <Button size="sm" variant="secondary" onClick={runHealthcheck} disabled={running} title="Verifica em tempo real quais instâncias estão conectadas ao WhatsApp.">
            <Activity className="h-3 w-3 mr-1" />
            {running ? 'Verificando...' : 'Verificar conexões'}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <span>
          <strong className="text-foreground">Instâncias livres não geram custo.</strong>{' '}
          A cobrança mensal de uma instância só começa no momento em que ela é vinculada a um profissional.
          O valor por instância depende da faixa de volume vigente (configurável abaixo).
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando pool...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} hint="instâncias cadastradas" />
            <StatCard label="Livres" value={stats.free} variant="success" hint="sem custo" />
            <StatCard label="Em uso" value={stats.assigned} variant="primary" hint="cobrança ativa" />
            <StatCard label="Desativadas" value={stats.disabled} variant="muted" hint="não cobradas" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span title="Percentual de instâncias do pool que já estão vinculadas a profissionais (e, portanto, gerando cobrança).">Utilização das instâncias</span>
              <span className="tabular-nums">{stats.utilization}%</span>
            </div>
            <Progress value={stats.utilization} className="h-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-3 bg-emerald-500/5 border-emerald-500/20">
              <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground mb-1">
                <Zap className="h-3 w-3" /> Custo mensal cobrado
              </div>
              <div className="text-lg font-semibold tabular-nums">{fmtUsd(stats.billedUsd)}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ≈ {fmtBrl(stats.billedUsd * rate)} · {stats.assigned} × {fmtUsd(stats.unitPrice)}
              </div>
            </Card>
            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground mb-1">
                <Tags className="h-3 w-3" /> Faixa de preço atual
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {stats.tier
                  ? `${stats.tier.min_quantity}${stats.tier.max_quantity ? `–${stats.tier.max_quantity}` : '+'} inst`
                  : 'Padrão'}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {fmtUsd(stats.unitPrice)} por instância em uso
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
          </div>

          {/* Volume tiers section */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setShowTiers(s => !s)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/40"
            >
              <span className="flex items-center gap-2">
                <Tags className="h-3.5 w-3.5" /> Faixas de desconto por volume ({(tiers ?? []).length})
              </span>
              {showTiers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showTiers && (
              <div className="px-3 pb-3">
                <PricingTiersEditor tiers={tiers ?? []} onChanged={() => refetchTiers()} />
              </div>
            )}
          </div>

          {/* Add new instance */}
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">Adicionar nova instância ao pool</p>
            <p className="text-[11px] text-muted-foreground">
              Compre em <code>user.ultramsg.com</code> com a sua conta master e cole abaixo.
              Enquanto a instância estiver livre, ela não gera custo no app.
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
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <code className="text-foreground truncate">{row.instance_id}</code>
                        {row.status === 'free' && <Badge variant="outline" className="text-[10px]">livre · sem custo</Badge>}
                        {row.status === 'assigned' && (
                          <Badge className="bg-green-500 text-[10px]">
                            em uso · {profName} · desde {fmtDate(row.activated_at)}
                          </Badge>
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

function PricingTiersEditor({ tiers, onChanged }: { tiers: TierRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Record<string, Partial<TierRow>>>({});
  const [newTier, setNewTier] = useState<{ min: string; max: string; price: string }>({ min: '', max: '', price: '' });
  const [busy, setBusy] = useState(false);

  const startEdit = (t: TierRow) => setEditing(prev => ({ ...prev, [t.id]: { ...t } }));
  const cancelEdit = (id: string) => setEditing(prev => {
    const { [id]: _, ...rest } = prev;
    return rest;
  });

  const saveEdit = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    setBusy(true);
    const payload: any = {
      min_quantity: Number(e.min_quantity),
      max_quantity: e.max_quantity == null || (e.max_quantity as any) === '' ? null : Number(e.max_quantity),
      unit_price_usd: Number(e.unit_price_usd),
      active: !!e.active,
    };
    const { error } = await (supabase as any)
      .from('whatsapp_volume_pricing_tiers').update(payload).eq('id', id);
    setBusy(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success('Faixa atualizada.');
    cancelEdit(id);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remover esta faixa?')) return;
    const { error } = await (supabase as any).from('whatsapp_volume_pricing_tiers').delete().eq('id', id);
    if (error) return toast.error('Erro: ' + error.message);
    toast.success('Faixa removida.');
    onChanged();
  };

  const add = async () => {
    const min = Number(newTier.min);
    const max = newTier.max.trim() === '' ? null : Number(newTier.max);
    const price = Number(newTier.price);
    if (!Number.isFinite(min) || min < 1) return toast.error('Quantidade mínima inválida.');
    if (max != null && (!Number.isFinite(max) || max < min)) return toast.error('Quantidade máxima inválida.');
    if (!Number.isFinite(price) || price < 0) return toast.error('Preço inválido.');
    setBusy(true);
    const { error } = await (supabase as any).from('whatsapp_volume_pricing_tiers').insert({
      min_quantity: min, max_quantity: max, unit_price_usd: price, active: true,
    });
    setBusy(false);
    if (error) return toast.error('Erro: ' + error.message);
    toast.success('Faixa adicionada.');
    setNewTier({ min: '', max: '', price: '' });
    onChanged();
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        O preço por instância é definido pela faixa em que se enquadra a quantidade de instâncias <strong>em uso</strong>.
        Deixe <em>máx</em> em branco para "em diante".
      </p>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-1 text-[11px] uppercase text-muted-foreground px-1">
        <div>De</div><div>Até</div><div>US$ / inst.</div><div>Ativo</div><div></div>
      </div>
      {tiers.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic py-2">Nenhuma faixa cadastrada.</p>
      )}
      {tiers.map(t => {
        const e = editing[t.id];
        const isEditing = !!e;
        return (
          <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-1 items-center text-xs">
            <Input
              type="number" min="1" className="h-7 text-xs"
              value={isEditing ? String(e.min_quantity ?? '') : String(t.min_quantity)}
              disabled={!isEditing}
              onChange={(ev) => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], min_quantity: Number(ev.target.value) } }))}
            />
            <Input
              type="number" min="1" className="h-7 text-xs"
              placeholder="em diante"
              value={isEditing ? (e.max_quantity == null ? '' : String(e.max_quantity)) : (t.max_quantity ?? '')}
              disabled={!isEditing}
              onChange={(ev) => setEditing(p => ({
                ...p, [t.id]: { ...p[t.id], max_quantity: ev.target.value === '' ? null : Number(ev.target.value) },
              }))}
            />
            <Input
              type="number" step="0.01" min="0" className="h-7 text-xs"
              value={isEditing ? String(e.unit_price_usd ?? '') : String(t.unit_price_usd)}
              disabled={!isEditing}
              onChange={(ev) => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], unit_price_usd: Number(ev.target.value) } }))}
            />
            <div className="flex items-center justify-center px-2">
              <input
                type="checkbox"
                checked={isEditing ? !!e.active : t.active}
                disabled={!isEditing}
                onChange={(ev) => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], active: ev.target.checked } }))}
              />
            </div>
            <div className="flex items-center gap-1">
              {!isEditing ? (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)} title="Editar">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(t.id)} title="Remover">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => saveEdit(t.id)}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => cancelEdit(t.id)}>
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-1 items-center pt-2 border-t border-dashed">
        <Input
          type="number" min="1" className="h-7 text-xs"
          placeholder="min" value={newTier.min}
          onChange={(e) => setNewTier(p => ({ ...p, min: e.target.value }))}
        />
        <Input
          type="number" min="1" className="h-7 text-xs"
          placeholder="máx (vazio = +)" value={newTier.max}
          onChange={(e) => setNewTier(p => ({ ...p, max: e.target.value }))}
        />
        <Input
          type="number" step="0.01" min="0" className="h-7 text-xs"
          placeholder="US$" value={newTier.price}
          onChange={(e) => setNewTier(p => ({ ...p, price: e.target.value }))}
        />
        <div />
        <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar
        </Button>
      </div>
    </div>
  );
}
