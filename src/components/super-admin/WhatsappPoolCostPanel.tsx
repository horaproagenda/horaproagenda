import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Activity, DollarSign, Package, RefreshCw, Zap } from 'lucide-react';

interface PoolRow {
  id: string;
  instance_id: string;
  status: 'free' | 'assigned' | 'disabled';
  assigned_professional_id: string | null;
  monthly_cost_usd: number | null;
  assigned_at: string | null;
}

const FX_KEY = 'super-admin:usd-brl-rate';

export function WhatsappPoolCostPanel() {
  const [rate, setRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(FX_KEY));
    return Number.isFinite(v) && v > 0 ? v : 5.5;
  });
  const [running, setRunning] = useState(false);

  useEffect(() => { localStorage.setItem(FX_KEY, String(rate)); }, [rate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-ultramsg-pool'],
    queryFn: async (): Promise<PoolRow[]> => {
      const { data, error } = await (supabase as any)
        .from('ultramsg_instance_pool')
        .select('id, instance_id, status, assigned_professional_id, monthly_cost_usd, assigned_at')
        .order('status', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PoolRow[];
    },
    staleTime: 15_000,
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao executar health check');
    } finally {
      setRunning(false);
    }
  };

  const fmtUsd = (v: number) => `US$ ${v.toFixed(2)}`;
  const fmtBrl = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Pool UltraMsg · Projeção de custos</h2>
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
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className="h-8 w-32 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground pb-2">
              O custo por instância é configurado na coluna <code>monthly_cost_usd</code> de cada
              registro do pool (padrão US$ 9,00).
            </p>
          </div>

          {stats.free === 0 && stats.total > 0 && (
            <Badge variant="destructive" className="text-[11px]">
              Pool sem vagas livres — compre novas instâncias UltraMsg para novos profissionais.
            </Badge>
          )}
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
