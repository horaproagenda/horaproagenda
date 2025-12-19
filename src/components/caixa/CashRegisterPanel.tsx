import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

type PeriodFilter = 'today' | 'yesterday' | 'week' | 'month';

export function CashRegisterPanel() {
  const queryClient = useQueryClient();
  const { currentOpenRegister, openCashRegister, closeCashRegister, isLoading } = useCashRegisters();
  const { transactions } = useCashTransactions(currentOpenRegister?.id);
  const { pendingReceivables, entries } = useFinancialEntries();

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

  // Receivables by period (from financial_entries with status pending/overdue and type receivable)
  const receivablesSummary = useMemo(() => {
    const { start, end } = getDateRange(receivablesPeriod);
    const periodReceivables = entries.filter(e => {
      if (e.type !== 'receivable' || (e.status !== 'pending' && e.status !== 'overdue')) return false;
      const date = parseISO(e.due_date);
      return isWithinInterval(date, { start, end });
    });
    return {
      entries: periodReceivables,
      total: periodReceivables.reduce((sum, e) => sum + Number(e.amount), 0),
      count: periodReceivables.length,
    };
  }, [entries, receivablesPeriod]);

  // Sales summary by period
  const salesSummary = useMemo(() => {
    const { start, end } = getDateRange(salesPeriod);
    const periodSales = transactions.filter(t => {
      if (t.type !== 'income' || t.category !== 'sale') return false;
      const date = parseISO(t.created_at);
      return isWithinInterval(date, { start, end });
    });
    return {
      transactions: periodSales,
      total: periodSales.reduce((sum, t) => sum + Number(t.amount), 0),
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
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0,00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
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
              Caixa #{currentOpenRegister.id.slice(-6).toUpperCase()}
            </CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-800 px-3 py-1">
              <Clock className="h-4 w-4 mr-1" />
              Aberto desde {format(parseISO(currentOpenRegister.opened_at), "HH:mm", { locale: ptBR })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Saldo Inicial</div>
              <div className="text-xl font-bold">R$ {currentOpenRegister.opening_balance.toFixed(2)}</div>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-sm text-green-600">Entradas</div>
              <div className="text-xl font-bold text-green-700">R$ {incomeTotal.toFixed(2)}</div>
            </div>
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-sm text-red-600">Saídas</div>
              <div className="text-xl font-bold text-red-700">R$ {expenseTotal.toFixed(2)}</div>
            </div>
            <div className="p-4 rounded-lg bg-primary/10">
              <div className="text-sm text-primary">Saldo Atual</div>
              <div className="text-xl font-bold text-primary">R$ {balance.toFixed(2)}</div>
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
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
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
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
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
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
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

            <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <Lock className="h-4 w-4 mr-2" />
                  Fechar Caixa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fechar Caixa</DialogTitle>
                  <DialogDescription>
                    Informe o valor em caixa para conferência
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Saldo Esperado</div>
                    <div className="text-2xl font-bold">R$ {balance.toFixed(2)}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Contado (R$)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={closingBalance}
                      onChange={(e) => setClosingBalance(e.target.value)}
                    />
                  </div>
                  {closingBalance && (
                    <div className={`p-3 rounded-lg ${
                      parseFloat(closingBalance) === balance ? 'bg-green-100 text-green-800' :
                      parseFloat(closingBalance) > balance ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      Diferença: R$ {(parseFloat(closingBalance) - balance).toFixed(2)}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCloseCashRegister} disabled={isLoading}>
                    Fechar Caixa
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Lembrete a Receber - Full Width */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              Lembrete a Receber
            </CardTitle>
            <PeriodTabs value={receivablesPeriod} onChange={setReceivablesPeriod} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
            <div>
              <div className="text-3xl font-bold text-amber-600">
                R$ {receivablesSummary.total.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">
                {receivablesSummary.count} lançamento(s) pendente(s)
              </div>
            </div>
            <DollarSign className="h-12 w-12 text-amber-200" />
          </div>
          
          {receivablesSummary.entries.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivablesSummary.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.description}</TableCell>
                        <TableCell>{entry.client?.name || '-'}</TableCell>
                        <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-right font-medium">R$ {Number(entry.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={entry.status === 'overdue' ? 'destructive' : 'secondary'}>
                            {entry.status === 'overdue' ? 'Vencido' : 'Pendente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum valor a receber para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vendas Recebidas - Full Width */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              Vendas Recebidas
            </CardTitle>
            <PeriodTabs value={salesPeriod} onChange={setSalesPeriod} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
            <div>
              <div className="text-3xl font-bold text-green-600">
                R$ {salesSummary.total.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">
                {salesSummary.count} venda(s) recebida(s)
              </div>
            </div>
            <DollarSign className="h-12 w-12 text-green-200" />
          </div>
          
          {salesSummary.transactions.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Forma de Pagamento</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesSummary.transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium">{transaction.description || '-'}</TableCell>
                        <TableCell>{transaction.payment_method || '-'}</TableCell>
                        <TableCell>{format(parseISO(transaction.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          R$ {Number(transaction.amount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
