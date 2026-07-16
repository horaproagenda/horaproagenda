import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, CheckCircle2, CalendarPlus, Crown, RefreshCw, Users, Ban, Trash2 } from 'lucide-react';
import { isSuperAdminEmail } from '@/lib/superAdminAllowlist';
import { Progress } from '@/components/ui/progress';
import { WhatsappPoolCostPanel } from '@/components/super-admin/WhatsappPoolCostPanel';
import { InterestLeadsPanel } from '@/components/super-admin/InterestLeadsPanel';
import { WhatsappReleasePanel } from '@/components/super-admin/WhatsappReleasePanel';
import { NewSignupsPanel } from '@/components/super-admin/NewSignupsPanel';

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

function HeaderHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {label}
          <span aria-hidden className="text-muted-foreground/60 text-[10px]">ⓘ</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px] max-w-[280px] leading-relaxed">{hint}</TooltipContent>
    </Tooltip>
  );
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
  const [grandfatherTarget, setGrandfatherTarget] = useState<AdminAccountRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminAccountRow | null>(null);
  const [cancelMonths, setCancelMonths] = useState(6);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccountRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Dupla checagem: papel super_admin + e-mail da criadora da plataforma.
    if (!hasRole('super_admin') || !isSuperAdminEmail(user.email)) {
      navigate('/', { replace: true });
    }
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

  // Uso de assentos por conta (atualiza em tempo real)
  const { data: seatsData, isLoading: seatsLoading } = useQuery({
    queryKey: ['super-admin-seat-usage'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('list_account_seat_usage_admin');
      if (error) throw error;
      return (data ?? []) as Array<{
        owner_user_id: string;
        email: string | null;
        status: string;
        is_grandfathered: boolean;
        seat_limit: number;
        used: number;
        available: number;
        current_period_end: string | null;
        trial_ends_at: string | null;
      }>;
    },
    enabled: !!user && hasRole('super_admin'),
    staleTime: 10_000,
  });

  // Realtime: invalida quando profiles ou assinaturas mudam
  useEffect(() => {
    if (!user || !hasRole('super_admin')) return;
    const ch = supabase
      .channel('super-admin-seat-realtime')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' } as any,
        () => qc.invalidateQueries({ queryKey: ['super-admin-seat-usage'] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_subscriptions' } as any,
        () => {
          qc.invalidateQueries({ queryKey: ['super-admin-seat-usage'] });
          qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, hasRole, qc]);

  const seatRows = useMemo(() => {
    if (!seatsData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return seatsData;
    return seatsData.filter(r => (r.email ?? '').toLowerCase().includes(q));
  }, [seatsData, search]);

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

  const confirmToggleGrandfathered = async () => {
    const row = grandfatherTarget;
    if (!row) return;
    try {
      const { error } = await supabase.functions.invoke('super-admin-action', {
        body: { action: 'set_grandfathered', owner_user_id: row.owner_user_id, value: !row.is_grandfathered },
      });
      if (error) throw error;
      toast.success('Conta atualizada');
      qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar');
    } finally {
      setGrandfatherTarget(null);
    }
  };

  const confirmCancelAccount = async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-cancel-account', {
        body: {
          owner_user_id: cancelTarget.owner_user_id,
          block_months: cancelMonths,
          reason: cancelReason || 'super_admin_cancellation',
          purge_data: true,
        },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Conta cancelada e bloqueada');
      setCancelTarget(null);
      setCancelReason('');
      setCancelMonths(6);
      qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
      qc.invalidateQueries({ queryKey: ['super-admin-seat-usage'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar conta');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-cancel-account', {
        body: {
          owner_user_id: deleteTarget.owner_user_id,
          reason: 'super_admin_delete',
          purge_data: true,
          skip_blocklist: true,
        },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Usuário apagado. Pode se cadastrar novamente.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['super-admin-accounts'] });
      qc.invalidateQueries({ queryKey: ['super-admin-seat-usage'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao apagar usuário');
    } finally {
      setDeleteSubmitting(false);
    }
  };



  return (
    <AppLayout title="Super Admin" subtitle="Painel da criadora da plataforma">
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

        <NewSignupsPanel />

        <WhatsappPoolCostPanel />

        <InterestLeadsPanel />

        <WhatsappReleasePanel />





        <Card className="overflow-x-auto">
          <TooltipProvider delayDuration={150}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] w-[26%]">
                    <HeaderHint label="E-mail" hint="E-mail da pessoa responsável pela conta (administradora da clínica)." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[14%]">
                    <HeaderHint label="Situação" hint="Estado atual da assinatura: Teste (período gratuito de 7 dias), Ativa (assinatura paga), Em atraso, Cancelada ou Vitalícia (acesso liberado por você, sem cobrança)." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[10%] text-center">
                    <HeaderHint label="Plano / Acessos" hint="Nível do plano contratado e quantidade de profissionais (acessos) que essa conta pode cadastrar." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[10%] text-center">
                    <HeaderHint label="Teste até" hint="Data em que o período gratuito de teste expira. Depois disso a conta precisa pagar para continuar." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[10%] text-center">
                    <HeaderHint label="Pago até" hint="Até quando o pagamento atual cobre o uso do aplicativo." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[14%]">
                    <HeaderHint label="Cobrança" hint="Identificador do cliente no sistema de pagamento (Stripe). Serve para localizar a conta dentro do painel de cobranças." />
                  </TableHead>
                  <TableHead className="text-[11px] w-[16%] text-right">
                    <HeaderHint label="Ações" hint="Atalhos para registrar pagamento manual, estender teste, conceder acesso vitalício ou cancelar e bloquear a conta." />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-xs py-6 text-center text-muted-foreground">Carregando contas...</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-xs py-6 text-center text-muted-foreground">Nenhuma conta encontrada</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const actionButton = (
                    label: string,
                    icon: React.ReactNode,
                    onClick: () => void,
                    variant: 'outline' | 'secondary' | 'destructive' = 'outline',
                  ) => (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant={variant}
                          className="h-6 w-6"
                          aria-label={label}
                          onClick={onClick}
                        >
                          {icon}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[11px]">{label}</TooltipContent>
                    </Tooltip>
                  );
                  const dataCell = (content: React.ReactNode, hint: string, className = '') => (
                    <TableCell className={`text-xs py-2 ${className}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help block">{content}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] max-w-[260px]">{hint}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  );
                  return (
                    <TableRow key={r.owner_user_id}>
                      {dataCell(
                        <>
                          <div className="font-medium truncate">{r.email ?? '—'}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{r.owner_user_id.slice(0, 8)}…</div>
                        </>,
                        'E-mail e código interno da conta responsável.',
                        'truncate max-w-0',
                      )}
                      {dataCell(
                        <div className="flex items-center gap-1 flex-wrap">
                          {statusBadge(r.status)}
                          {r.is_grandfathered && <Badge variant="outline" className="text-[10px]"><Crown className="h-3 w-3 mr-1" />Vitalícia</Badge>}
                        </div>,
                        'Situação atual da assinatura: Teste, Ativa, Em atraso, Cancelada ou Vitalícia (acesso gratuito concedido por você).',
                      )}
                      {dataCell(
                        <span className="tabular-nums">{r.plan_tier ?? '—'} / {r.seat_limit}</span>,
                        'Nível do plano contratado e quantidade de profissionais (acessos) permitidos.',
                        'tabular-nums text-center',
                      )}
                      {dataCell(
                        <span className="tabular-nums">{fmtDate(r.trial_ends_at)}</span>,
                        'Data em que o período gratuito de teste expira.',
                        'tabular-nums text-center',
                      )}
                      {dataCell(
                        <span className="tabular-nums">{fmtDate(r.current_period_end)}</span>,
                        'Até quando o pagamento atual mantém a conta ativa.',
                        'tabular-nums text-center',
                      )}
                      {dataCell(
                        <span className="tabular-nums">{r.stripe_customer_id ? r.stripe_customer_id.slice(0, 10) + '…' : '—'}</span>,
                        'Identificador desta conta dentro do sistema de cobrança Stripe. Útil para localizar o cliente no painel de pagamentos.',
                        'tabular-nums truncate max-w-0',
                      )}
                      <TableCell className="text-xs py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {actionButton(
                            'Registrar pagamento manual',
                            <CheckCircle2 className="h-3 w-3" />,
                            () => { setTarget(r); setMode('mark_paid'); },
                          )}
                          {actionButton(
                            'Estender período de teste',
                            <CalendarPlus className="h-3 w-3" />,
                            () => { setTarget(r); setMode('extend_trial'); },
                          )}
                          {actionButton(
                            r.is_grandfathered ? 'Remover acesso vitalício' : 'Conceder acesso vitalício',
                            <Crown className="h-3 w-3" />,
                            () => setGrandfatherTarget(r),
                            r.is_grandfathered ? 'destructive' : 'secondary',
                          )}
                          {actionButton(
                            'Cancelar e bloquear conta',
                            <Ban className="h-3 w-3" />,
                            () => setCancelTarget(r),
                            'destructive',
                          )}
                          {actionButton(
                            'Apagar usuário (sem bloqueio — permite novo cadastro)',
                            <Trash2 className="h-3 w-3" />,
                            () => setDeleteTarget(r),
                            'destructive',
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </Card>

        <Card className="overflow-x-auto">
          <div className="flex items-center gap-2 px-3 pt-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Uso de acessos por conta</h2>
            <span className="text-[11px] text-muted-foreground">(atualiza em tempo real)</span>
          </div>
          <p className="px-3 pb-2 text-[11px] text-muted-foreground">
            Cada "acesso" corresponde a um profissional cadastrado naquela clínica.
            O plano contratado define o limite de acessos disponíveis.
          </p>
          <TooltipProvider delayDuration={150}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">
                    <HeaderHint label="Conta" hint="E-mail da pessoa responsável pela clínica." />
                  </TableHead>
                  <TableHead className="text-[11px]">
                    <HeaderHint label="Situação" hint="Estado da assinatura: Teste, Ativa, Em atraso, Cancelada ou Vitalícia." />
                  </TableHead>
                  <TableHead className="text-[11px]">
                    <HeaderHint label="Usados" hint="Quantos profissionais já estão cadastrados na conta agora." />
                  </TableHead>
                  <TableHead className="text-[11px]">
                    <HeaderHint label="Limite" hint="Quantos profissionais o plano contratado permite cadastrar no total." />
                  </TableHead>
                  <TableHead className="text-[11px]">
                    <HeaderHint label="Disponíveis" hint="Quantos profissionais ainda podem ser cadastrados antes de atingir o limite do plano." />
                  </TableHead>
                  <TableHead className="text-[11px] min-w-[140px]">
                    <HeaderHint label="Ocupação" hint="Percentual de acessos já utilizados em relação ao limite do plano. Quando chega perto de 100%, a conta precisa contratar mais acessos para continuar cadastrando profissionais." />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seatsLoading && (
                  <TableRow><TableCell colSpan={6} className="text-xs py-6 text-center text-muted-foreground">Carregando uso de acessos...</TableCell></TableRow>
                )}
                {!seatsLoading && seatRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-xs py-6 text-center text-muted-foreground">Nenhuma conta encontrada</TableCell></TableRow>
                )}
                {seatRows.map((r) => {
                  const pct = r.is_grandfathered ? 0 : (r.seat_limit > 0 ? Math.min(100, Math.round((r.used / r.seat_limit) * 100)) : 0);
                  const near = !r.is_grandfathered && r.seat_limit > 0 && r.available <= 1 && r.used < r.seat_limit;
                  const reached = !r.is_grandfathered && r.seat_limit > 0 && r.used >= r.seat_limit;
                  const cell = (content: React.ReactNode, hint: string, className = '') => (
                    <TableCell className={`text-xs py-2 ${className}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{content}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] max-w-[260px]">{hint}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  );
                  return (
                    <TableRow key={r.owner_user_id}>
                      {cell(
                        <div>
                          <div className="font-medium">{r.email ?? '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{r.owner_user_id.slice(0, 8)}…</div>
                        </div>,
                        'Conta da clínica. O código abaixo é o identificador interno do usuário.',
                      )}
                      {cell(
                        <div className="flex items-center gap-1">
                          {statusBadge(r.status)}
                          {r.is_grandfathered && <Badge variant="outline" className="text-[10px]"><Crown className="h-3 w-3 mr-1" />Vitalícia</Badge>}
                        </div>,
                        'Situação atual da assinatura. "Vitalícia" significa acesso liberado por você, sem cobrança e sem limite.',
                      )}
                      {cell(<span className="tabular-nums">{r.used}</span>, 'Profissionais já cadastrados nesta conta no momento.')}
                      {cell(<span className="tabular-nums">{r.is_grandfathered ? '∞' : r.seat_limit}</span>, 'Limite máximo de profissionais permitido pelo plano contratado. "∞" significa ilimitado.')}
                      {cell(
                        <span className="tabular-nums">{r.is_grandfathered ? '∞' : r.available}</span>,
                        'Acessos restantes antes de atingir o limite do plano.',
                        reached ? 'text-red-700 font-semibold' : near ? 'text-amber-700 font-semibold' : '',
                      )}
                      {cell(
                        r.is_grandfathered ? (
                          <span className="text-[11px] text-purple-700">Ilimitado</span>
                        ) : r.seat_limit > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 w-24" />
                            <span className="text-[10px] tabular-nums w-8 text-right">{pct}%</span>
                          </div>
                        ) : <span className="text-[11px] text-muted-foreground">—</span>,
                        'Quanto do plano já está sendo usado. 100% significa que a conta atingiu o limite e precisa contratar mais acessos para cadastrar novos profissionais.',
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </Card>
      </div>


      <Dialog open={!!target && !!mode} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'mark_paid' ? 'Registrar pagamento manual' : 'Estender período de teste'}
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
                  <Label className="text-xs">Nível do plano (opcional)</Label>
                  <Input type="number" placeholder="Ex.: 1, 2, 3" value={planTier} onChange={(e) => setPlanTier(e.target.value === '' ? '' : Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Identifica o pacote contratado. Deixe em branco para manter o atual.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vagas de profissional (opcional)</Label>
                  <Input type="number" placeholder="Ex.: 3" value={seatLimit} onChange={(e) => setSeatLimit(e.target.value === '' ? '' : Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Quantos profissionais a conta pode cadastrar. Deixe em branco para manter o atual.</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Marca a conta como <strong>ativa</strong> e estende o período pago a partir do fim atual (ou de hoje, se já expirou).
              </p>
            </div>
          )}

          {mode === 'extend_trial' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Dias extras de teste</Label>
                <Input type="number" min={1} max={365} value={extraDays} onChange={(e) => setExtraDays(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Adiciona dias ao período de teste atual (ou inicia um novo teste a partir de hoje, se já expirou).
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!grandfatherTarget} onOpenChange={(o) => { if (!o) setGrandfatherTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {grandfatherTarget?.is_grandfathered ? 'Remover acesso vitalício?' : 'Conceder acesso vitalício?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {grandfatherTarget?.is_grandfathered
                ? `A conta ${grandfatherTarget?.email ?? ''} voltará ao fluxo normal de cobrança (teste/assinatura).`
                : `A conta ${grandfatherTarget?.email ?? ''} terá acesso gratuito e ilimitado, sem cobranças.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleGrandfathered}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-4 w-4" /> Cancelar e bloquear conta
            </DialogTitle>
          </DialogHeader>
          {cancelTarget && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Conta: <span className="font-medium text-foreground">{cancelTarget.email}</span>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive">
                Esta ação <strong>exclui permanentemente</strong> o usuário do Auth, remove perfil, papéis e dados de cadastro,
                e registra os identificadores (e-mail, celular, CPF, CNPJ, nome) em uma lista de bloqueio.
                Enquanto o bloqueio estiver ativo, qualquer nova tentativa de cadastro com esses dados será barrada.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Bloquear por (meses)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={cancelMonths}
                    onChange={(e) => setCancelMonths(Math.max(1, Math.min(120, Number(e.target.value) || 6)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input
                    placeholder="Ex.: fraude, abuso, solicitação do usuário"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCancelTarget(null); setCancelReason(''); }} disabled={cancelSubmitting}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={confirmCancelAccount} disabled={cancelSubmitting}>
              {cancelSubmitting ? 'Cancelando...' : 'Cancelar e bloquear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Apagar usuário definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Conta: <span className="font-medium text-foreground">{deleteTarget?.email}</span>
              </span>
              <span className="block">
                Esta ação <strong>exclui o usuário do Auth, perfil, papéis e cadastros</strong> e
                <strong> não registra bloqueio</strong>. O usuário poderá se cadastrar novamente
                com o mesmo e-mail, CPF, CNPJ ou celular, como se nunca tivesse usado o aplicativo.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteAccount(); }}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting ? 'Apagando...' : 'Apagar usuário'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
