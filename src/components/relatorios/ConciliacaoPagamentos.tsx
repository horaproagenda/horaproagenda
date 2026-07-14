import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Loader2, Search, Download, User, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportToCSV } from '@/lib/exportUtils';
import { useNavigate } from 'react-router-dom';

type DivergenceKind =
  | 'ok'
  | 'missing_financial'
  | 'missing_cash'
  | 'missing_appointment_payment'
  | 'amount_mismatch';

interface Row {
  key: string;
  clientId: string | null;
  clientName: string;
  appointmentId: string | null;
  date: string; // yyyy-mm-dd
  appointmentAmount: number;
  financialAmount: number;
  cashAmount: number;
  divergence: DivergenceKind;
  description: string;
}

const KIND_LABEL: Record<DivergenceKind, string> = {
  ok: 'Conciliado',
  missing_financial: 'Sem lançamento no financeiro',
  missing_cash: 'Sem lançamento no caixa',
  missing_appointment_payment: 'Sem baixa no agendamento',
  amount_mismatch: 'Valor divergente',
};

const KIND_BADGE: Record<DivergenceKind, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
  missing_financial: 'bg-amber-500/15 text-amber-700 border-amber-500/40',
  missing_cash: 'bg-sky-500/15 text-sky-700 border-sky-500/40',
  missing_appointment_payment: 'bg-red-500/15 text-red-700 border-red-500/40',
  amount_mismatch: 'bg-orange-500/15 text-orange-700 border-orange-500/40',
};

const money = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ConciliacaoPagamentos() {
  const accountOwnerId = useAccountOwnerId();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'divergent' | DivergenceKind>('divergent');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['conciliacao-pagamentos', accountOwnerId],
    enabled: !!accountOwnerId,
    queryFn: async (): Promise<Row[]> => {
      const [aptRes, feRes, ctRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, client_id, amount_paid, payment_status, payment_date, start_time, clients(name)')
          .eq('account_owner_id', accountOwnerId!)
          .gt('amount_paid', 0),
        supabase
          .from('financial_entries')
          .select('id, client_id, appointment_id, amount, paid_date, status, type')
          .eq('account_owner_id', accountOwnerId!)
          .eq('status', 'paid'),
        supabase
          .from('cash_transactions')
          .select('id, amount, reference_id, reference_type, type, created_at')
          .eq('account_owner_id', accountOwnerId!)
          .eq('type', 'income'),
      ]);
      if (aptRes.error) throw aptRes.error;
      if (feRes.error) throw feRes.error;
      if (ctRes.error) throw ctRes.error;

      const appointments = aptRes.data || [];
      const financials = feRes.data || [];
      const cash = ctRes.data || [];

      const feByApt = new Map<string, number>();
      const feUnmatched = new Map<string, { amount: number; client_id: string | null; paid_date: string | null }>();
      for (const f of financials as any[]) {
        if (f.appointment_id) {
          feByApt.set(f.appointment_id, (feByApt.get(f.appointment_id) || 0) + Number(f.amount || 0));
        } else {
          feUnmatched.set(f.id, {
            amount: Number(f.amount || 0),
            client_id: f.client_id,
            paid_date: f.paid_date,
          });
        }
      }

      const cashByApt = new Map<string, number>();
      for (const c of cash as any[]) {
        if (c.reference_type === 'appointment' && c.reference_id) {
          cashByApt.set(c.reference_id, (cashByApt.get(c.reference_id) || 0) + Number(c.amount || 0));
        }
      }

      const rows: Row[] = [];

      for (const a of appointments as any[]) {
        const aptAmt = Number(a.amount_paid || 0);
        const feAmt = feByApt.get(a.id) || 0;
        const cashAmt = cashByApt.get(a.id) || 0;
        const date = (a.payment_date || a.start_time || '').slice(0, 10);
        let divergence: DivergenceKind = 'ok';
        if (feAmt === 0 && cashAmt === 0) divergence = 'missing_financial';
        else if (feAmt === 0) divergence = 'missing_financial';
        else if (Math.abs(feAmt - aptAmt) > 0.01) divergence = 'amount_mismatch';

        rows.push({
          key: `apt:${a.id}`,
          clientId: a.client_id,
          clientName: a.clients?.name || 'Cliente removido',
          appointmentId: a.id,
          date,
          appointmentAmount: aptAmt,
          financialAmount: feAmt,
          cashAmount: cashAmt,
          divergence,
          description: 'Agendamento com pagamento',
        });
      }

      // Financial entries sem appointment vinculado — não aparecem no perfil
      // do cliente por agendamento, mas devem estar reconciliadas de outra forma.
      for (const [id, f] of feUnmatched.entries()) {
        rows.push({
          key: `fe:${id}`,
          clientId: f.client_id,
          clientName: 'Lançamento avulso',
          appointmentId: null,
          date: (f.paid_date || '').slice(0, 10),
          appointmentAmount: 0,
          financialAmount: f.amount,
          cashAmount: 0,
          divergence: 'missing_appointment_payment',
          description: 'Lançamento no financeiro sem agendamento vinculado',
        });
      }

      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return rows;
    },
  });

  const filtered = useMemo(() => {
    const list = data || [];
    const term = search.trim().toLowerCase();
    return list.filter((r) => {
      if (filter === 'all') {
        // ok
      } else if (filter === 'divergent') {
        if (r.divergence === 'ok') return false;
      } else if (r.divergence !== filter) return false;
      if (!term) return true;
      return r.clientName.toLowerCase().includes(term);
    });
  }, [data, search, filter]);

  const stats = useMemo(() => {
    const list = data || [];
    const total = list.length;
    const divergent = list.filter((r) => r.divergence !== 'ok').length;
    const missingFin = list.filter((r) => r.divergence === 'missing_financial').length;
    const mismatch = list.filter((r) => r.divergence === 'amount_mismatch').length;
    const missingApt = list.filter((r) => r.divergence === 'missing_appointment_payment').length;
    return { total, divergent, missingFin, mismatch, missingApt };
  }, [data]);

  const handleExport = () => {
    if (!filtered.length) return;
    exportToCSV({
      filename: 'conciliacao-pagamentos',
      headers: ['Data', 'Cliente', 'Descrição', 'Valor Agendamento', 'Valor Financeiro', 'Valor Caixa', 'Status'],
      rows: filtered.map((r) => [
        r.date,
        r.clientName,
        r.description,
        r.appointmentAmount,
        r.financialAmount,
        r.cashAmount,
        KIND_LABEL[r.divergence],
      ]),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total analisados" value={stats.total} tone="neutral" />
        <StatCard label="Divergentes" value={stats.divergent} tone="red" />
        <StatCard label="Sem financeiro" value={stats.missingFin} tone="amber" />
        <StatCard label="Valor divergente" value={stats.mismatch} tone="orange" />
        <StatCard label="Sem agendamento" value={stats.missingApt} tone="sky" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="divergent">Somente divergências</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="missing_financial">Sem lançamento no financeiro</SelectItem>
              <SelectItem value="amount_mismatch">Valor divergente</SelectItem>
              <SelectItem value="missing_appointment_payment">Sem agendamento vinculado</SelectItem>
              <SelectItem value="missing_cash">Sem lançamento no caixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recarregar'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/70" />
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === 'divergent'
              ? 'Nenhuma divergência encontrada — financeiro, caixa e perfil do cliente estão alinhados.'
              : 'Nenhum pagamento encontrado.'}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[110px]">Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Agend.</TableHead>
                    <TableHead className="text-right">Financeiro</TableHead>
                    <TableHead className="text-right">Caixa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.date ? format(parseISO(r.date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                      </TableCell>
                      <TableCell className="font-medium">{r.clientName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.appointmentAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.financialAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.cashAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={KIND_BADGE[r.divergence]}>
                          {r.divergence !== 'ok' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {KIND_LABEL[r.divergence]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.clientId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => navigate(`/clientes/${r.clientId}`)}
                          >
                            <User className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'red' | 'amber' | 'orange' | 'sky';
}) {
  const toneCls =
    tone === 'red'
      ? 'text-red-600'
      : tone === 'amber'
      ? 'text-amber-600'
      : tone === 'orange'
      ? 'text-orange-600'
      : tone === 'sky'
      ? 'text-sky-600'
      : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
          <DollarSign className="h-3 w-3" /> {label}
        </div>
        <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
