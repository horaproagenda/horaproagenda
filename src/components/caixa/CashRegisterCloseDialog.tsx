import { useMemo, useState } from 'react';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Banknote,
  Smartphone,
  FileText,
  Receipt,
  CheckCircle,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { CashRegister } from '@/hooks/useCashRegisters';
import { useCashTransactions } from '@/hooks/useCashTransactions';
import { useAppointments } from '@/hooks/useAppointments';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

interface PaymentBreakdown {
  credit: number;
  debit: number;
  pix: number;
  cash: number;
  boleto: number;
  check: number;
  transfer: number;
  other: number;
}

interface CardFees {
  total: number;
  byBrand: Record<string, number>;
}

interface CashRegisterCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRegister: CashRegister;
  openingBalance: number;
  onClose: (data: {
    closingBalance: number;
    expectedBalance: number;
    totalReceived: number;
    totalReceivables: number;
    paymentsCount: number;
    paymentBreakdown: Record<string, number>;
    notes: string;
  }) => void;
  isLoading?: boolean;
}

export function CashRegisterCloseDialog({
  open,
  onOpenChange,
  currentRegister,
  openingBalance,
  onClose,
  isLoading,
}: CashRegisterCloseDialogProps) {
  const { transactions } = useCashTransactions(currentRegister?.id);
  const { appointments } = useAppointments();
  const { entries } = useFinancialEntries();
  
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  // Calculate breakdown from transactions
  const breakdown = useMemo((): PaymentBreakdown => {
    const result: PaymentBreakdown = {
      credit: 0,
      debit: 0,
      pix: 0,
      cash: 0,
      boleto: 0,
      check: 0,
      transfer: 0,
      other: 0,
    };
    
    // Get income transactions from cash register
    transactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const method = (t.payment_method || '').toLowerCase();
        const amount = Number(t.amount);
        
        if (method.includes('crédito') || method.includes('credito') || method.includes('credit')) {
          result.credit += amount;
        } else if (method.includes('débito') || method.includes('debito') || method.includes('debit')) {
          result.debit += amount;
        } else if (method.includes('pix')) {
          result.pix += amount;
        } else if (method.includes('dinheiro') || method.includes('espécie') || method.includes('cash')) {
          result.cash += amount;
        } else if (method.includes('boleto')) {
          result.boleto += amount;
        } else if (method.includes('cheque') || method.includes('check')) {
          result.check += amount;
        } else if (method.includes('transferência') || method.includes('transfer')) {
          result.transfer += amount;
        } else {
          result.other += amount;
        }
      });
    
    return result;
  }, [transactions]);

  // Calculate card fees from transactions
  const cardFees = useMemo((): CardFees => {
    let total = 0;
    const byBrand: Record<string, number> = {};
    
    transactions
      .filter(t => t.type === 'income' && t.card_fee_amount && t.card_fee_amount > 0)
      .forEach(t => {
        const feeAmount = Number(t.card_fee_amount);
        total += feeAmount;
        
        const method = t.payment_method || 'Cartão';
        byBrand[method] = (byBrand[method] || 0) + feeAmount;
      });
    
    return { total, byBrand };
  }, [transactions]);

  // Calculate expenses/withdrawals
  const expenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category || 'other';
        if (!acc[category]) {
          acc[category] = { total: 0, items: [] };
        }
        acc[category].total += Number(t.amount);
        acc[category].items.push({
          description: t.description || 'Saída',
          amount: Number(t.amount),
        });
        return acc;
      }, {} as Record<string, { total: number; items: { description: string; amount: number }[] }>);
  }, [transactions]);

  const totalExpenses = useMemo(() => 
    Object.values(expenses).reduce((sum, cat) => sum + cat.total, 0),
    [expenses]
  );

  // Calculate totals
  const totals = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const salesTotal = transactions
      .filter(t => t.type === 'income' && t.category === 'sale')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const paymentsCount = transactions.filter(t => t.type === 'income' && t.category === 'sale').length;
    
    return {
      income,
      expense,
      salesTotal,
      paymentsCount,
      balance: openingBalance + income - expense,
    };
  }, [transactions, openingBalance]);

  // Pending receivables for today
  const pendingReceivables = useMemo(() => {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    
    // Pending appointments
    const pendingAppointments = appointments.filter(apt => {
      if (apt.payment_status !== 'pending') return false;
      if (apt.status === 'cancelled' || apt.status === 'missed' || apt.status === 'rescheduled') return false;
      const aptDate = parseISO(apt.start_time);
      return isWithinInterval(aptDate, { start: todayStart, end: todayEnd });
    });
    
    const appointmentTotal = pendingAppointments.reduce((sum, apt) => {
      return sum + (apt.service?.price || apt.package_appointment?.package?.total_price || 0);
    }, 0);
    
    // Pending financial entries
    const pendingEntries = entries.filter(e => {
      if (e.type !== 'receivable' || (e.status !== 'pending' && e.status !== 'overdue')) return false;
      const date = parseISO(e.due_date);
      return isWithinInterval(date, { start: todayStart, end: todayEnd });
    });
    
    const entriesTotal = pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    
    return {
      count: pendingAppointments.length + pendingEntries.length,
      total: appointmentTotal + entriesTotal,
    };
  }, [appointments, entries]);

  const expectedBalance = totals.balance;
  const enteredBalance = parseFloat(closingBalance) || 0;
  const difference = enteredBalance - expectedBalance;

  const handleClose = () => {
    onClose({
      closingBalance: enteredBalance,
      expectedBalance,
      totalReceived: totals.income,
      totalReceivables: pendingReceivables.total,
      paymentsCount: totals.paymentsCount,
      paymentBreakdown: breakdown as unknown as Record<string, number>,
      notes,
    });
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const PaymentRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color?: string }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-medium">{formatCurrency(value)}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Fechar Caixa
          </DialogTitle>
          <DialogDescription>
            Confira os valores recebidos antes de fechar o caixa
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {/* Opening Balance */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Saldo Inicial</span>
                <span className="font-semibold">{formatCurrency(openingBalance)}</span>
              </div>
            </div>

            <Separator />

            {/* Payments Breakdown */}
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-green-600" />
                Recebimentos por Forma de Pagamento
              </h4>
              
              <PaymentRow icon={CreditCard} label="Cartão de Crédito" value={breakdown.credit} color="text-purple-600" />
              <PaymentRow icon={CreditCard} label="Cartão de Débito" value={breakdown.debit} color="text-blue-600" />
              <PaymentRow icon={Smartphone} label="PIX" value={breakdown.pix} color="text-emerald-600" />
              <PaymentRow icon={Banknote} label="Dinheiro" value={breakdown.cash} color="text-green-600" />
              <PaymentRow icon={FileText} label="Boleto" value={breakdown.boleto} color="text-amber-600" />
              <PaymentRow icon={FileText} label="Cheque" value={breakdown.check} color="text-orange-600" />
              {breakdown.transfer > 0 && (
                <PaymentRow icon={Receipt} label="Transferência" value={breakdown.transfer} color="text-cyan-600" />
              )}
              {breakdown.other > 0 && (
                <PaymentRow icon={Receipt} label="Outros" value={breakdown.other} />
              )}
              
              <Separator className="my-2" />
              
              <div className="flex justify-between items-center py-2 font-semibold">
                <span>Total Recebido</span>
                <span className="text-green-600">{formatCurrency(totals.income)}</span>
              </div>
            </div>

            {/* Card Fees Section */}
            {cardFees.total > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <CreditCard className="h-4 w-4 text-orange-500" />
                    Taxas de Cartão (Maquininha)
                  </h4>
                  {Object.entries(cardFees.byBrand).map(([brand, amount]) => (
                    <div key={brand} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-muted-foreground">{brand}</span>
                      <span className="text-orange-500">- {formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center py-2 font-semibold text-orange-600">
                    <span>Total Taxas</span>
                    <span>- {formatCurrency(cardFees.total)}</span>
                  </div>
                </div>
              </>
            )}

            {/* Expenses/Withdrawals Section */}
            {totalExpenses > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    Saídas / Despesas
                  </h4>
                  {Object.entries(expenses).map(([category, data]) => (
                    <div key={category} className="space-y-1">
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 text-sm">
                          <span className="text-muted-foreground truncate max-w-[200px]">{item.description}</span>
                          <span className="text-red-500">- {formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center py-2 font-semibold text-red-600">
                    <span>Total Saídas</span>
                    <span>- {formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Pending Receivables */}
            {pendingReceivables.count > 0 && (
              <>
                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Pendentes de Recebimento</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-sm text-muted-foreground">{pendingReceivables.count} lançamento(s)</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {formatCurrency(pendingReceivables.total)}
                    </span>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Expected Balance */}
            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">Saldo Esperado</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(expectedBalance)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Saldo inicial + Entradas - Saídas
              </div>
            </div>

            <Separator />

            {/* Counted Balance Input */}
            <div className="space-y-2">
              <Label htmlFor="closingBalance">Valor Contado em Caixa (R$)</Label>
              <Input
                id="closingBalance"
                type="number"
                min={0}
                step={0.01}
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder="0,00"
                className="text-lg"
              />
            </div>

            {/* Difference */}
            {closingBalance && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                difference === 0 ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300' :
                difference > 0 ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300' :
                'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
              }`}>
                {difference === 0 ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span className="font-medium">
                  Diferença: {formatCurrency(difference)}
                  {difference > 0 && ' (sobra)'}
                  {difference < 0 && ' (falta)'}
                </span>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre o fechamento..."
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleClose} disabled={isLoading || !closingBalance}>
            Confirmar Fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
