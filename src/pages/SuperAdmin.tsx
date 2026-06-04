import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, CheckCircle2, CalendarPlus, Crown, RefreshCw } from 'lucide-react';

interface AdminAccountRow {
  owner_user_id: string;
  email: string | null;
  status: string;
  plan_tier: number | null;
  seat_limit: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  is_grandfathered: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    trial: { label: 'Trial', cls: 'bg-blue-100 text-blue-800' },
    active: { label: 'Ativa', cls: 'bg-green-100 text-green-800' },
    past_due: { label: 'Em atraso', cls: 'bg-amber-100 text-amber-900' },
    canceled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800' },
    grandfathered: { label: 'Vitalícia', cls: 'bg-purple-100 text-purple-800' },
  };
  const m = map[s] ?? { label: s, cls: 'bg-muted text-foreground' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}

export default function SuperAdmin() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  // Dialog state
  const [target, setTarget] = useState<AdminAccountRow | null>(null);
  const [mode, setMode] = useState<'mark_paid' | 'extend_trial' | null>(null);
  const [months, setMonths] = useState(1);
  const [planTier, setPlanTier] = useState<number | ''>('');
  const [seatLimit, setSeatLimit] = useState<number | ''>('');
  const [extraDays, setExtraDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !hasRole('super_admin')) navigate('/', { replace: true });
  }, [user, hasRole, navigate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-accounts'],
    queryFn: async (): Promise<AdminAccountRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('list_all_accounts_admin');
      if (error) throw error;
      return (data ?? []) as AdminAccountRow[];
    },
    enabled: !!user && hasRole('super_admin'),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.stripe_customer_id ?? '').toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [data, search]);

  const closeDialog = () => {
    setTarget(null);
    setMode(null);
    setMonths(1);
    setPlanTier('');
    setSeatLimit('');
    setExtraDays(30);
  };

  const submit = async () => {
    if (!target || !mode) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { action: mode, owner_user_id: target.owner_user_id };
      if (mode === 'mark_paid') {
        body.months = months;
        if (planTier !== '') body.plan_tier = Number(planTier);
        if (seatLimit !== '') body.seat_limit = Number(seatLimit);
      } else if (mode === 'extend_trial') {
        body.extra_days = extraDays;
      }
      const { data: res, error } = await supabase.functions.invoke('super-admin-action', { body });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success(mode === 'mark_paid' ? 'Pagamento manual registrado' : 'Trial estendido');
      closeDialog();
      qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha na operação';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGrandfathered = async (row: AdminAccountRow) => {
    if (!confirm(row.is_grandfathered ? 'Remover acesso vitalício desta conta?' : 'Conceder acesso vitalício (gratuito) a esta conta?')) return;
    try {
      const { error } = await supabase.functions.invoke('super-admin-action', {
        body: { action: 'set_grandfathered', owner_user_id: row.owner_user_id, value: !row.is_grandfathered },
      });
      if (error) throw error;
      toast.success('Conta atualizada');
      qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Super Admin · Plataforma</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        <Card className="p-3">
          <Input
            placeholder="Buscar por e-mail, status ou customer_id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">E-mail</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px]">Plano / Seats</TableHead>
                <TableHead className="text-[11px]">Trial até</TableHead>
                <TableHead className="text-[11px]">Pago até</TableHead>
                <TableHead className="text-[11px]">Stripe</TableHead>
                <TableHead className="text-[11px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-xs py-6 text-center text-muted-foreground">Carregando contas...</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-xs py-6 text-center text-muted-foreground">Nenhuma conta encontrada</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.owner_user_id}>
                  <TableCell className="text-xs py-2 tabular-nums">
                    <div className="font-medium">{r.email ?? '—'}</div>
                    <div className="text-[10px] text-muted-foreground">{r.owner_user_id.slice(0, 8)}…</div>
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <div className="flex items-center gap-1">
                      {statusBadge(r.status)}
                      {r.is_grandfathered && <Badge variant="outline" className="text-[10px]"><Crown className="h-3 w-3 mr-1" />Vitalícia</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs py-2 tabular-nums">{r.plan_tier ?? '—'} / {r.seat_limit}</TableCell>
                  <TableCell className="text-xs py-2 tabular-nums">{fmtDate(r.trial_ends_at)}</TableCell>
                  <TableCell className="text-xs py-2 tabular-nums">{fmtDate(r.current_period_end)}</TableCell>
                  <TableCell className="text-xs py-2 tabular-nums">{r.stripe_customer_id ? r.stripe_customer_id.slice(0, 12) + '…' : '—'}</TableCell>
                  <TableCell className="text-xs py-2 text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => { setTarget(r); setMode('mark_paid'); }}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Baixa pagto
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setTarget(r); setMode('extend_trial'); }}>
                      <CalendarPlus className="h-3.5 w-3.5 mr-1" /> + Trial
                    </Button>
                    <Button size="sm" variant={r.is_grandfathered ? 'destructive' : 'secondary'} onClick={() => toggleGrandfathered(r)}>
                      <Crown className="h-3.5 w-3.5 mr-1" /> {r.is_grandfathered ? 'Remover' : 'Vitalícia'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={!!target && !!mode} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'mark_paid' ? 'Dar baixa em pagamento manual' : 'Estender período de teste'}
            </DialogTitle>
          </DialogHeader>

          {target && (
            <div className="text-xs text-muted-foreground mb-2">
              Conta: <span className="font-medium text-foreground">{target.email}</span>
            </div>
          )}

          {mode === 'mark_paid' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Meses pagos</Label>
                <Input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Plan tier (opcional)</Label>
                  <Input type="number" value={planTier} onChange={(e) => setPlanTier(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Seats (opcional)</Label>
                  <Input type="number" value={seatLimit} onChange={(e) => setSeatLimit(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Marca status como <strong>active</strong> e estende o período pago a partir do final atual (ou de hoje, se já expirou).
              </p>
            </div>
          )}

          {mode === 'extend_trial' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Dias extras de trial</Label>
                <Input type="number" min={1} max={365} value={extraDays} onChange={(e) => setExtraDays(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Adiciona dias ao trial atual (ou inicia novo trial a partir de hoje, se já expirou).
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
