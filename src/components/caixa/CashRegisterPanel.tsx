import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  DollarSign, 
  Wallet, 
  ArrowDownCircle, 
  ArrowUpCircle,
  Clock,
  Plus,
  Minus,
  Trash2,
  Lock,
  Receipt,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useAppointments } from '@/hooks/useAppointments';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { CashRegisterCloseDialog } from './CashRegisterCloseDialog';

type PeriodFilter = 'today' | 'yesterday' | 'week' | 'month';

export function CashRegisterPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOpenRegister, openCashRegister, closeCashRegister, isLoading } = useCashRegisters();
  const { transactions } = useCashTransactions(currentOpenRegister?.id);
  const { entries } = useFinancialEntries();
  const { appointments } = useAppointments();

  // Real-time sync for sales with agenda, financeiro, card fees and discounts
  useEffect(() => {
    const channel = supabase
      .channel('cash_register_panel_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments_audit' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

  // Suprimento/Sangria/Despesa
  const [transactionType, setTransactionType] = useState<'suprimento' | 'sangria' | 'despesa' | null>(null);
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');

  // Period filters
  const [receivablesPeriod, setReceivablesPeriod] = useState<PeriodFilter>('today');
  const [salesPeriod, setSalesPeriod] = useState<PeriodFilter>('today');

  const getDateRange = (period: PeriodFilter) => {
    const today = new Date();
    switch (period) {
      case 'today':
        return { start: startOfDay(today), end: endOfDay(today) };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'week':
        return { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfDay(today) };
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  // Calculate totals from transactions
  const { incomeTotal, expenseTotal, balance } = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      incomeTotal: income,
      expenseTotal: expense,
      balance: (currentOpenRegister?.opening_balance || 0) + income - expense,
    };
  }, [transactions, currentOpenRegister]);

  // Receivables by period - combining financial_entries AND pending appointments
  const receivablesSummary = useMemo(() => {
    const { start, end } = getDateRange(receivablesPeriod);
    
    // Financial entries with pending status
    const periodReceivables = entries.filter(e => {
      if (e.type !== 'receivable' || (e.status !== 'pending' && e.status !== 'overdue')) return false;
      const date = parseISO(e.due_date);
      return isWithinInterval(date, { start, end });
    });
    
    // Appointments with pending payment status - exclude cancelled, missed and rescheduled
    const pendingAppointments = appointments.filter(apt => {
      if (apt.payment_status !== 'pending') return false;
      if (apt.status === 'cancelled' || apt.status === 'missed' || apt.status === 'rescheduled') return false;
      const aptDate = parseISO(apt.start_time);
      return isWithinInterval(aptDate, { start, end });
    });
    
    // Convert pending appointments to receivable format
    const appointmentReceivables = pendingAppointments.map(apt => ({
      id: apt.id,
      type: 'appointment' as const,
      description: `Agendamento: ${apt.service?.name || apt.package_appointment?.package?.name || 'Serviço'}`,
      client: apt.client,
      due_date: apt.start_time.split('T')[0],
      amount: apt.service?.price || apt.package_appointment?.package?.total_price || 0,
      status: 'pending' as const,
    }));
    
    const allReceivables = [...periodReceivables, ...appointmentReceivables];
    
    return {
      entries: allReceivables,
      total: allReceivables.reduce((sum, e) => sum + Number(e.amount), 0),
      count: allReceivables.length,
    };
  }, [entries, appointments, receivablesPeriod]);

  // Sales summary by period - fetch service/package names
  const salesSummary = useMemo(() => {
    const { start, end } = getDateRange(salesPeriod);
    const periodSales = transactions.filter(t => {
      if (t.type !== 'income' || t.category !== 'sale') return false;
      const date = parseISO(t.created_at);
      return isWithinInterval(date, { start, end });
    });
    
    const total = periodSales.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalFees = periodSales.reduce((sum, t) => sum + (t.card_fee_amount || 0), 0);
    const netTotal = total - totalFees;
    
    return {
      transactions: periodSales,
      total,
      totalFees,
      netTotal,
      count: periodSales.length,
    };
  }, [transactions, salesPeriod]);

  const handleOpenCashRegister = () => {
    const balance = parseFloat(openingBalance) || 0;
    openCashRegister.mutate(balance, {
      onSuccess: () => {
        setIsOpenDialogOpen(false);
        setOpeningBalance('');
      },
    });
  };

  const handleCloseCashRegister = async () => {
    if (!currentOpenRegister) return;

    const closing = parseFloat(closingBalance) || 0;
    const expected = balance;

    closeCashRegister.mutate({
      id: currentOpenRegister.id,
      closingBalance: closing,
      expectedBalance: expected,
      totalReceived: incomeTotal,
      totalReceivables: 0,
      paymentsCount: transactions.filter(t => t.type === 'income').length,
      paymentBreakdown: {},
      notes: '',
    }, {
      onSuccess: () => {
        setIsCloseDialogOpen(false);
        setClosingBalance('');
      },
    });
  };

  const handleTransaction = async () => {
    if (!currentOpenRegister || !transactionType) return;

    const amount = parseFloat(transactionAmount) || 0;
    if (amount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const typeMap = {
      suprimento: { type: 'income', category: 'suprimento' },
      sangria: { type: 'expense', category: 'sangria' },
      despesa: { type: 'expense', category: 'despesa' },
    };

    const { type, category } = typeMap[transactionType];

    try {
      await supabase.from('cash_transactions').insert({
        cash_register_id: currentOpenRegister.id,
        type,
        category,
        description: transactionDescription || `${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}`,
        amount,
        created_by: user?.id,
      });

      // If it's despesa, also create financial entry
      if (transactionType === 'despesa') {
        await supabase.from('financial_entries').insert({
          type: 'expense',
          description: transactionDescription || 'Despesa do caixa',
          amount,
          due_date: format(new Date(), 'yyyy-MM-dd'),
          paid_date: format(new Date(), 'yyyy-MM-dd'),
          status: 'paid',
          created_by: user?.id,
        });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      }

      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      toast.success(`${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} registrado com sucesso!`);
      setTransactionType(null);
      setTransactionAmount('');
      setTransactionDescription('');
    } catch (error: any) {
      toast.error('Erro ao registrar: ' + error.message);
    }
  };

  const handleDeleteCashRegister = async () => {
    if (!currentOpenRegister) return;

    try {
      // Delete all transactions first
      await supabase
        .from('cash_transactions')
        .delete()
        .eq('cash_register_id', currentOpenRegister.id);

      // Delete the register
      await supabase
        .from('cash_registers')
        .delete()
        .eq('id', currentOpenRegister.id);

      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      toast.success('Caixa excluído com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao excluir caixa: ' + error.message);
    }
  };

  const PeriodTabs = ({ value, onChange }: { value: PeriodFilter; onChange: (v: PeriodFilter) => void }) => (
    <div className="flex gap-1">
      {(['today', 'yesterday', 'week', 'month'] as PeriodFilter[]).map((period) => (
        <Button
          key={period}
          size="sm"
          variant={value === period ? 'default' : 'outline'}
          onClick={() => onChange(period)}
          className="text-xs px-3 py-1"
        >
          {period === 'today' ? 'Hoje' :
           period === 'yesterday' ? 'Ontem' :
           period === 'week' ? 'Semana' : 'Mês'}
        </Button>
      ))}
    </div>
  );

  if (!currentOpenRegister) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Wallet className="h-20 w-20 text-muted-foreground mb-6" />
          <h3 className="text-2xl font-semibold mb-2">Caixa Fechado</h3>
          <p className="text-muted-foreground mb-6">Abra o caixa para começar a registrar vendas</p>
          
          <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="px-8">
                <Plus className="h-5 w-5 mr-2" />
                Abrir Caixa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir Caixa</DialogTitle>
                <DialogDescription>
                  Informe o saldo inicial do caixa
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Saldo Inicial (R$)</Label>
                  <CurrencyInput
                    placeholder="0,00"
                    value={openingBalance}
                    onValueChange={(value) => setOpeningBalance(String(value))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpenDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleOpenCashRegister} disabled={isLoading}>
                  Abrir Caixa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cash Register Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Receipt className="h-6 w-6" />
              Caixa #{currentOpenRegister.register_number}
            </CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-800 px-3 py-1">
              <Clock className="h-4 w-4 mr-1" />
              Aberto desde {format(parseISO(currentOpenRegister.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Saldo Inicial</div>
              <div className="text-xl font-bold">R$ {currentOpenRegister.opening_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-sm text-green-600">Entradas</div>
              <div className="text-xl font-bold text-green-700">R$ {incomeTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-sm text-red-600">Saídas</div>
              <div className="text-xl font-bold text-red-700">R$ {expenseTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="p-4 rounded-lg bg-primary/10">
              <div className="text-sm text-primary">Saldo Atual</div>
              <div className="text-xl font-bold text-primary">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Dialog open={transactionType === 'suprimento'} onOpenChange={(o) => !o && setTransactionType(null)}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setTransactionType('suprimento')}>
                  <ArrowDownCircle className="h-4 w-4 mr-2 text-green-600" />
                  Suprimento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Suprimento</DialogTitle>
                  <DialogDescription>Adicionar dinheiro ao caixa</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <CurrencyInput
                      value={transactionAmount}
                      onValueChange={(value) => setTransactionAmount(String(value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTransactionType(null)}>Cancelar</Button>
                  <Button onClick={handleTransaction}>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={transactionType === 'sangria'} onOpenChange={(o) => !o && setTransactionType(null)}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setTransactionType('sangria')}>
                  <ArrowUpCircle className="h-4 w-4 mr-2 text-orange-600" />
                  Sangria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sangria</DialogTitle>
                  <DialogDescription>Retirar dinheiro do caixa</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <CurrencyInput
                      value={transactionAmount}
                      onValueChange={(value) => setTransactionAmount(String(value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTransactionType(null)}>Cancelar</Button>
                  <Button onClick={handleTransaction}>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={transactionType === 'despesa'} onOpenChange={(o) => !o && setTransactionType(null)}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setTransactionType('despesa')}>
                  <Minus className="h-4 w-4 mr-2 text-red-600" />
                  Despesas
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Despesa</DialogTitle>
                  <DialogDescription>Esta despesa será lançada no caixa e no financeiro</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <CurrencyInput
                      value={transactionAmount}
                      onValueChange={(value) => setTransactionAmount(String(value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Descrição da despesa"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTransactionType(null)}>Cancelar</Button>
                  <Button onClick={handleTransaction}>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Caixa
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Caixa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Todas as transações deste caixa serão excluídas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCashRegister} className="bg-destructive text-destructive-foreground">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="default" onClick={() => setIsCloseDialogOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Fechar Caixa
            </Button>
            
            <CashRegisterCloseDialog
              open={isCloseDialogOpen}
              onOpenChange={setIsCloseDialogOpen}
              currentRegister={currentOpenRegister}
              openingBalance={currentOpenRegister.opening_balance}
              onClose={(data) => {
                closeCashRegister.mutate({
                  id: currentOpenRegister.id,
                  closingBalance: data.closingBalance,
                  expectedBalance: data.expectedBalance,
                  totalReceived: data.totalReceived,
                  totalReceivables: data.totalReceivables,
                  paymentsCount: data.paymentsCount,
                  paymentBreakdown: data.paymentBreakdown,
                  notes: data.notes,
                }, {
                  onSuccess: () => {
                    setIsCloseDialogOpen(false);
                    setClosingBalance('');
                  },
                });
              }}
              isLoading={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lembrete a Receber - Full Width */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Lembrete a Receber
            </CardTitle>
            <PeriodTabs value={receivablesPeriod} onChange={setReceivablesPeriod} />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center justify-between mb-2 p-2 bg-amber-50 dark:bg-amber-950 rounded-md">
            <div>
              <div className="text-lg font-bold text-amber-600">
                R$ {receivablesSummary.total.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {receivablesSummary.count} pendente(s)
              </div>
            </div>
            <DollarSign className="h-6 w-6 text-amber-200" />
          </div>
          
          {receivablesSummary.entries.length > 0 ? (
            <ScrollArea className="h-[220px]">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-[10px] py-1 px-2">Descrição</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Cliente</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Vencimento</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Valor</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Status</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivablesSummary.entries.map((entry) => (
                      <TableRow key={entry.id} className="h-7">
                        <TableCell className="text-[11px] font-medium py-1 px-2">{entry.description}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2">{entry.client?.name || '-'}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2">{format(parseISO(entry.due_date), 'dd/MM/yy')}</TableCell>
                        <TableCell className="text-[11px] text-right font-medium py-1 px-2">R$ {Number(entry.amount).toFixed(2)}</TableCell>
                        <TableCell className="py-1 px-2">
                          <Badge variant={entry.status === 'overdue' ? 'destructive' : 'secondary'} className="text-[9px] h-4 px-1">
                            {entry.status === 'overdue' ? 'Vencido' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-1 px-2">
                          {entry.type === 'appointment' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 text-[10px] px-1.5"
                              onClick={() => {
                                window.location.href = `/agenda?appointment=${entry.id}`;
                              }}
                            >
                              <DollarSign className="h-2.5 w-2.5 mr-0.5" />
                              Pagar
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-4 text-[11px] text-muted-foreground">
              Nenhum valor a receber para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vendas Recebidas - Full Width */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Vendas Recebidas
            </CardTitle>
            <PeriodTabs value={salesPeriod} onChange={setSalesPeriod} />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="p-2 bg-green-50 dark:bg-green-950 rounded-md">
              <div className="text-[10px] text-muted-foreground">Valor Bruto</div>
              <div className="text-base font-bold text-green-600">
                R$ {salesSummary.total.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {salesSummary.count} venda(s)
              </div>
            </div>
            <div className="p-2 bg-destructive/10 rounded-md">
              <div className="text-[10px] text-muted-foreground">Taxas de Cartão</div>
              <div className="text-base font-bold text-destructive">
                -R$ {salesSummary.totalFees.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Descontado
              </div>
            </div>
            <div className="p-2 bg-primary/10 rounded-md">
              <div className="text-[10px] text-muted-foreground">Valor Líquido</div>
              <div className="text-base font-bold text-primary">
                R$ {salesSummary.netTotal.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Efetivo recebido
              </div>
            </div>
          </div>
          
          {salesSummary.transactions.length > 0 ? (
            <ScrollArea className="h-[220px]">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-[10px] py-1 px-2">Descrição</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Pagamento</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Data/Hora</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Bruto</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Taxa</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Líquido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesSummary.transactions.map((transaction) => {
                      const hasFee = transaction.card_fee_amount && transaction.card_fee_amount > 0;
                      const netAmount = hasFee 
                        ? Number(transaction.amount) - transaction.card_fee_amount!
                        : Number(transaction.amount);
                      
                      return (
                        <TableRow key={transaction.id} className="h-7">
                          <TableCell className="text-[11px] font-medium py-1 px-2">
                            {transaction.description || '-'}
                            {transaction.installments && transaction.installments > 1 && (
                              <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1">
                                {transaction.installments}x
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] py-1 px-2">{transaction.payment_method_name || transaction.payment_method || '-'}</TableCell>
                          <TableCell className="text-[11px] py-1 px-2">{format(parseISO(transaction.created_at), 'dd/MM/yy HH:mm')}</TableCell>
                          <TableCell className="text-[11px] text-right font-medium text-green-600 py-1 px-2">
                            R$ {Number(transaction.amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-[11px] text-right py-1 px-2">
                            {hasFee ? (
                              <span className="text-destructive font-medium">
                                -R$ {transaction.card_fee_amount!.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] text-right font-bold text-primary py-1 px-2">
                            R$ {netAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-4 text-[11px] text-muted-foreground">
              Nenhuma venda para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
