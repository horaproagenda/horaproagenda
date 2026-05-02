import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Search, Package, XCircle, DollarSign, CheckCircle2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { toast } from 'sonner';

interface PackageSaleRow {
  saleId: string;
  packageId: string | null;
  packageName: string;
  clientId: string | null;
  clientName: string;
  saleDate: string;
  totalAmount: number;
  paidAmount: number;
  paymentMethodName: string;
  totalSessions: number;
  usedSessions: number;
  isCancelled: boolean;
}

export function PacotesFinanceiro() {
  const queryClient = useQueryClient();
  const { paymentMethods } = usePaymentMethods();
  const [search, setSearch] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selected, setSelected] = useState<PackageSaleRow | null>(null);
  const [costPerApplication, setCostPerApplication] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [refundMethod, setRefundMethod] = useState('Dinheiro');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['package-sales-financial'],
    queryFn: async () => {
      const { data: sales, error } = await supabase
        .from('single_sales')
        .select(`
          id, package_id, sale_date, final_amount, original_amount, discount_amount, paid_at, notes,
          client:clients(id, name),
          payment_method:payment_methods(id, name),
          package:service_packages(
            id, name, total_sessions,
            appointments:package_appointments(id, status, appointment_id)
          )
        `)
        .eq('item_type', 'package')
        .order('sale_date', { ascending: false });
      if (error) throw error;
      return (sales || []).map((s: any): PackageSaleRow => {
        const apps = s.package?.appointments || [];
        const used = apps.filter((a: any) => a.status === 'completed' || a.status === 'missed').length;
        const total = s.package?.total_sessions || 0;
        const isCancelled = (s.notes || '').toUpperCase().includes('CANCELADO');
        return {
          saleId: s.id,
          packageId: s.package_id || s.package?.id || null,
          packageName: s.package?.name || 'Pacote',
          clientId: s.client?.id || null,
          clientName: s.client?.name || '-',
          saleDate: s.sale_date || (s.paid_at ? String(s.paid_at).slice(0,10) : ''),
          totalAmount: Number(s.original_amount || s.final_amount || 0),
          paidAmount: Number(s.final_amount || 0),
          paymentMethodName: s.payment_method?.name || '-',
          totalSessions: total,
          usedSessions: used,
          isCancelled,
        };
      });
    },
  });

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel('pacotes-financeiro-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package-sales-financial'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_packages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package-sales-financial'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package-sales-financial'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package-sales-financial'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.packageName.toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.paymentMethodName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const refundAmount = useMemo(() => {
    if (!selected) return 0;
    const used = selected.usedSessions;
    const cost = parseFloat(costPerApplication || '0') || 0;
    const pen = parseFloat(penalty || '0') || 0;
    const r = selected.paidAmount - (used * cost) - pen;
    return Math.max(0, Math.round(r * 100) / 100);
  }, [selected, costPerApplication, penalty]);

  const openCancel = (row: PackageSaleRow) => {
    setSelected(row);
    setCostPerApplication('0');
    setPenalty('0');
    setRefundMethod('Dinheiro');
    setCancelOpen(true);
  };

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Sem pacote selecionado');
      const { data: { user } } = await supabase.auth.getUser();
      const today = format(new Date(), 'yyyy-MM-dd');
      const refundDescription = `Devolução de pacote: ${selected.packageName} - Cliente: ${selected.clientName} - Pagamento: ${refundMethod}`;

      // 1. Register refund in cash_transactions (caixa)
      const { data: openReg } = await supabase
        .from('cash_registers')
        .select('id')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openReg?.id && refundAmount > 0) {
        await supabase.from('cash_transactions').insert({
          cash_register_id: openReg.id,
          type: 'expense',
          category: 'refund',
          description: refundDescription,
          amount: refundAmount,
          payment_method: refundMethod,
          reference_id: selected.saleId,
          reference_type: 'package_refund',
          created_by: user?.id,
        });
      }

      // 2. Register refund in financial_entries (financeiro)
      if (refundAmount > 0) {
        await supabase.from('financial_entries').insert({
          type: 'expense',
          description: refundDescription,
          amount: refundAmount,
          status: 'paid',
          due_date: today,
          paid_date: today,
          client_id: selected.clientId,
          notes: `Devolução de pacote cancelado - Aplicações usadas: ${selected.usedSessions} - Multa: R$ ${penalty}`,
          created_by: user?.id,
        });
      }

      // 3. If refund method is "Crédito em Conta" -> add to client credit_balance
      if (refundMethod.toLowerCase().includes('crédito') && selected.clientId && refundAmount > 0) {
        const { data: cli } = await supabase
          .from('clients')
          .select('credit_balance')
          .eq('id', selected.clientId)
          .single();
        const newBalance = Number(cli?.credit_balance || 0) + refundAmount;
        await supabase.from('clients').update({ credit_balance: newBalance }).eq('id', selected.clientId);
      }

      // 4. Mark sale as cancelled
      await supabase
        .from('single_sales')
        .update({
          notes: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)} em ${today} via ${refundMethod}`,
        })
        .eq('id', selected.saleId);

      // 5. Find package appointments and delete linked appointments from agenda
      if (selected.packageId) {
        const { data: pkgApps } = await supabase
          .from('package_appointments')
          .select('id, appointment_id')
          .eq('package_id', selected.packageId);
        const appointmentIds = (pkgApps || [])
          .map(p => p.appointment_id)
          .filter(Boolean) as string[];
        if (appointmentIds.length > 0) {
          // Hard delete appointments from agenda + client history
          await supabase.from('appointments').delete().in('id', appointmentIds);
        }
        // Delete package_appointments records
        await supabase.from('package_appointments').delete().eq('package_id', selected.packageId);
        // Deactivate package
        await supabase
          .from('service_packages')
          .update({ is_active: false })
          .eq('id', selected.packageId);
      }

      return { refundAmount };
    },
    onSuccess: (data) => {
      toast.success(`Pacote cancelado. Devolução de R$ ${data.refundAmount.toFixed(2)} registrada.`);
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['package-sales-financial'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['client-profile'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(`Erro ao cancelar pacote: ${e.message || 'tente novamente'}`);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por pacote, cliente ou forma de pagamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Badge variant="outline" className="text-xs">
          <Package className="h-3 w-3 mr-1" /> {filtered.length} pacotes
        </Badge>
      </div>

      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhum pacote vendido encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Pacote</TableHead>
                    <TableHead className="text-[10px]">Cliente</TableHead>
                    <TableHead className="text-[10px]">Data</TableHead>
                    <TableHead className="text-[10px] text-right">Valor</TableHead>
                    <TableHead className="text-[10px] text-right">Pago</TableHead>
                    <TableHead className="text-[10px]">Pagamento</TableHead>
                    <TableHead className="text-[10px] text-center">Aplicações</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px] w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.saleId}>
                      <TableCell className="text-xs font-medium">{r.packageName}</TableCell>
                      <TableCell className="text-xs">{r.clientName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.saleDate ? format(new Date(`${r.saleDate}T12:00:00`), 'dd/MM/yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right">R$ {r.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right text-primary font-semibold">R$ {r.paidAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{r.paymentMethodName}</TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {r.usedSessions} / {r.totalSessions}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.isCancelled ? (
                          <Badge variant="destructive" className="text-[10px]">Cancelado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Ativo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!r.isCancelled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => openCancel(r)}
                            title="Cancelar pacote"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Package Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Cancelar Pacote</DialogTitle>
            <DialogDescription className="text-xs">
              {selected?.packageName} - {selected?.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-muted rounded">
                <p className="text-muted-foreground text-[10px]">Aplicações utilizadas</p>
                <p className="font-bold">{selected?.usedSessions} de {selected?.totalSessions}</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-muted-foreground text-[10px]">Valor pago</p>
                <p className="font-bold">R$ {selected?.paidAmount.toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Custo médio por aplicação ao profissional (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={costPerApplication}
                onChange={(e) => setCostPerApplication(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Total descontado: R$ {((selected?.usedSessions || 0) * (parseFloat(costPerApplication) || 0)).toFixed(2)}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Multa/Penalidade (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Forma de devolução ao cliente</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dinheiro" className="text-xs">Dinheiro</SelectItem>
                  <SelectItem value="PIX" className="text-xs">PIX</SelectItem>
                  <SelectItem value="Transferência" className="text-xs">Transferência</SelectItem>
                  <SelectItem value="Crédito em Conta" className="text-xs">Crédito em Conta do Cliente</SelectItem>
                  {paymentMethods.filter(m => !m.name.toLowerCase().includes('boleto')).map(m => (
                    <SelectItem key={m.id} value={m.name} className="text-xs">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-primary/10 rounded space-y-1">
              <p className="text-xs text-muted-foreground">Valor a devolver ao cliente:</p>
              <p className="text-lg font-bold text-primary">R$ {refundAmount.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">
                Cálculo: Pago (R$ {selected?.paidAmount.toFixed(2)}) − Aplicações usadas ({selected?.usedSessions} × R$ {parseFloat(costPerApplication || '0').toFixed(2)}) − Multa (R$ {parseFloat(penalty || '0').toFixed(2)})
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground">
              ⚠️ Os agendamentos vinculados a este pacote serão removidos da agenda e do histórico do cliente.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Processando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
