import { useState, useMemo } from 'react';
import { format, parseISO, isAfter, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Check, AlertCircle, DollarSign, Pencil, Undo2, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { useFinancialEntries, FinancialEntry } from '@/hooks/useFinancialEntries';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { useReminders } from '@/hooks/useReminders';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdvancedFilters, type FilterGroup } from '@/components/shared/AdvancedFilters';
import { calculateRecurringValues } from '@/lib/recurringEntryCalculation';
import { useQueryClient } from '@tanstack/react-query';

export function ContasAPagar() {
  const { payables, createEntry, updateEntry, deleteEntry } = useFinancialEntries();
  const { expenseCategories } = useFinancialCategories();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeBanks } = useBanks();
  const { createReminder } = useReminders();
  const { settings } = useBusinessSettings();
  const queryClient = useQueryClient();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
    date: ['all'],
    status: ['all'],
  });
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [entryToPay, setEntryToPay] = useState<any>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [paymentBankId, setPaymentBankId] = useState<string>('');
  const [paymentInstallments, setPaymentInstallments] = useState<string>('1');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [createBoletoReminder, setCreateBoletoReminder] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  
  // Confirmation step
  const [confirmationStep, setConfirmationStep] = useState(false);
  
  // Cancel/reverse payment
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [entryToCancel, setEntryToCancel] = useState<any>(null);

  // Batch payment
  const [batchMode, setBatchMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [batchPayDialogOpen, setBatchPayDialogOpen] = useState(false);
  const [batchPaymentMethodId, setBatchPaymentMethodId] = useState('');
  const [batchPaymentBankId, setBatchPaymentBankId] = useState('');
  const [batchConfirmStep, setBatchConfirmStep] = useState(false);
  
  const [form, setForm] = useState({
    description: '',
    amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    category_id: '',
    payment_method_id: '',
    bank_id: '',
    is_recurring: false,
    recurring_frequency: 'monthly',
    installments: '1',
    recurring_count: '1',
    split_value: false,
    overdue_tolerance_days: '0',
  });

  // Filter groups
  const filterGroups: FilterGroup[] = useMemo(() => [
    {
      id: 'date',
      label: 'Período',
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'today', label: 'Hoje' },
        { value: 'month', label: 'Este mês' },
      ],
      multiSelect: false,
    },
    {
      id: 'status',
      label: 'Status',
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'pending', label: 'Pendentes' },
        { value: 'paid', label: 'Pagas' },
      ],
      multiSelect: false,
    },
  ], []);

  const handleFilterChange = (groupId: string, values: string[]) => {
    setSelectedFilters(prev => ({ ...prev, [groupId]: values }));
  };

  // Filter payables based on date and status
  const filteredPayables = useMemo(() => {
    const today = new Date();
    const dateFilter = selectedFilters.date || ['all'];
    const statusFilter = selectedFilters.status || ['all'];
    
    return payables.filter((entry) => {
      if (!statusFilter.includes('all')) {
        if (statusFilter.includes('pending') && entry.status === 'paid') return false;
        if (statusFilter.includes('paid') && entry.status !== 'paid') return false;
      }
      
      if (!dateFilter.includes('all')) {
        if (dateFilter.includes('today')) {
          const dueDate = parseISO(entry.due_date);
          return isWithinInterval(dueDate, { start: startOfDay(today), end: endOfDay(today) });
        } else if (dateFilter.includes('month')) {
          const dueDate = parseISO(entry.due_date);
          return isWithinInterval(dueDate, { start: startOfMonth(today), end: endOfMonth(today) });
        }
      }
      return true;
    });
  }, [payables, selectedFilters]);

  const pendingFiltered = useMemo(() => filteredPayables.filter(e => e.status !== 'paid'), [filteredPayables]);

  const resetForm = () => {
    setForm({
      description: '',
      amount: '',
      due_date: format(new Date(), 'yyyy-MM-dd'),
      category_id: '',
      payment_method_id: '',
      bank_id: '',
      is_recurring: false,
      recurring_frequency: 'monthly',
      installments: '1',
      recurring_count: '1',
      split_value: false,
      overdue_tolerance_days: '0',
    });
  };

  const getNextDueDate = (baseDate: string, frequency: string, index: number): string => {
    const date = parseISO(baseDate);
    switch (frequency) {
      case 'weekly':
        return format(new Date(date.setDate(date.getDate() + (7 * index))), 'yyyy-MM-dd');
      case 'biweekly':
        return format(new Date(date.setDate(date.getDate() + (14 * index))), 'yyyy-MM-dd');
      case 'monthly':
        return format(new Date(date.setMonth(date.getMonth() + index)), 'yyyy-MM-dd');
      case 'quarterly':
        return format(new Date(date.setMonth(date.getMonth() + (3 * index))), 'yyyy-MM-dd');
      case 'annual':
        return format(new Date(date.setFullYear(date.getFullYear() + index)), 'yyyy-MM-dd');
      default:
        return format(new Date(date.setMonth(date.getMonth() + index)), 'yyyy-MM-dd');
    }
  };

  const handleSubmit = async () => {
    const totalAmount = parseFloat(form.amount) || 0;
    const recurringCount = parseInt(form.recurring_count) || 1;
    const toleranceDays = parseInt(form.overdue_tolerance_days) || 0;
    
    const calc = calculateRecurringValues({
      amount: totalAmount,
      installments: recurringCount,
      isTotalValue: form.split_value,
    });
    
    const amountPerEntry = calc.perInstallmentAmount;

    if (form.is_recurring && recurringCount > 1) {
      for (let i = 0; i < recurringCount; i++) {
        const dueDate = getNextDueDate(form.due_date, form.recurring_frequency, i);
        await createEntry.mutateAsync({
          type: 'payable',
          description: `${form.description} (${i + 1}/${recurringCount})`,
          amount: amountPerEntry,
          due_date: dueDate,
          paid_date: null,
          category_id: form.category_id || null,
          payment_method_id: form.payment_method_id || null,
          bank_id: form.bank_id || null,
          client_id: null,
          professional_id: null,
          notes: null,
          is_recurring: true,
          recurring_day: null,
          recurring_count: recurringCount,
          recurring_frequency: form.recurring_frequency,
          appointment_id: null,
          installments: parseInt(form.installments) || 1,
          paid_by: null,
          status: 'pending',
          overdue_tolerance_days: toleranceDays,
        } as any);
      }
    } else {
      await createEntry.mutateAsync({
        type: 'payable',
        description: form.description,
        amount: amountPerEntry,
        due_date: form.due_date,
        paid_date: null,
        category_id: form.category_id || null,
        payment_method_id: form.payment_method_id || null,
        bank_id: form.bank_id || null,
        client_id: null,
        professional_id: null,
        notes: null,
        is_recurring: form.is_recurring,
        recurring_day: null,
        recurring_count: form.is_recurring ? recurringCount : null,
        recurring_frequency: form.is_recurring ? form.recurring_frequency : null,
        appointment_id: null,
        installments: parseInt(form.installments) || 1,
        paid_by: null,
        status: 'pending',
        overdue_tolerance_days: toleranceDays,
      } as any);
    }
    setDialogOpen(false);
    resetForm();
  };

  const openPayDialog = (entry: any, editMode = false) => {
    setEntryToPay(entry);
    setIsEditingPayment(editMode);
    setPaymentMethodId(entry.payment_method_id || '');
    setPaymentBankId(entry.bank_id || '');
    setPaymentInstallments(entry.installments?.toString() || '1');
    setPaidAmount(Number(entry.amount).toFixed(2));
    setCreateBoletoReminder(false);
    setConfirmationStep(false);
    setPayDialogOpen(true);
  };

  // Check if selected payment method is "Boleto"
  const selectedPaymentMethod = activePaymentMethods.find(pm => pm.id === paymentMethodId);
  const isBoleto = selectedPaymentMethod?.name?.toLowerCase().includes('boleto');
  const isCard = selectedPaymentMethod?.name?.toLowerCase().includes('cartão') || 
                 selectedPaymentMethod?.name?.toLowerCase().includes('crédito');
  const showInstallments = isBoleto || isCard;
  const maxInstallments = selectedPaymentMethod?.max_installments || 1;

  // Computed confirmation values
  const paid = parseFloat(paidAmount) || 0;
  const entryAmount = Number(entryToPay?.amount || 0);
  const remainder = Math.round((entryAmount - paid) * 100) / 100;
  const isPartial = remainder > 0.01;
  const selectedBank = activeBanks.find(b => b.id === paymentBankId);

  const handleGoToConfirmation = () => {
    if (!paymentMethodId) {
      toast.error('Selecione a forma de pagamento');
      return;
    }
    if (paid <= 0) {
      toast.error('Informe o valor pago');
      return;
    }
    setConfirmationStep(true);
  };

  const handleConfirmPayment = async () => {
    if (!entryToPay) return;

    if (isEditingPayment) {
      await updateEntry.mutateAsync({
        id: entryToPay.id,
        amount: paid,
        payment_method_id: paymentMethodId || null,
        bank_id: paymentBankId || null,
        installments: parseInt(paymentInstallments) || 1,
      });
      if (entryToPay.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
      setPayDialogOpen(false);
      setEntryToPay(null);
      setIsEditingPayment(false);
      setConfirmationStep(false);
      return;
    }

    if (isBoleto && createBoletoReminder && entryToPay.due_date) {
      await createReminder.mutateAsync({
        title: `Verificar pagamento de boleto: ${entryToPay.description}`,
        description: `Verificar se o boleto "${entryToPay.description}" no valor de R$ ${entryAmount.toFixed(2)} foi pago. Caso positivo, dar baixa no sistema.`,
        reminder_date: entryToPay.due_date,
        reminder_time: '09:00',
        is_recurring: false,
        recurring_frequency: null,
        recurring_days: null,
        is_active: true,
        is_completed: false,
        category: 'financeiro',
        priority: 'high',
      });
    }
    
    if (!isBoleto || !createBoletoReminder) {
      await updateEntry.mutateAsync({
        id: entryToPay.id,
        amount: paid,
        original_amount: entryAmount,
        status: 'paid' as const,
        paid_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method_id: paymentMethodId || null,
        bank_id: paymentBankId || null,
        installments: parseInt(paymentInstallments) || 1,
        notes: isPartial
          ? `Pagamento parcial: R$ ${paid.toFixed(2)} de R$ ${entryAmount.toFixed(2)}. Restante: R$ ${remainder.toFixed(2)}`
          : entryToPay.notes,
      });

      if (isPartial) {
        await createEntry.mutateAsync({
          type: 'payable',
          description: `${entryToPay.description.replace(/\s*\(restante.*?\)$/i, '')} (restante)`,
          amount: remainder,
          due_date: entryToPay.due_date,
          category_id: entryToPay.category_id || null,
          payment_method_id: paymentMethodId || null,
          bank_id: paymentBankId || null,
          client_id: entryToPay.client_id || null,
          professional_id: entryToPay.professional_id || null,
          notes: `Saldo restante de "${entryToPay.description}" (original: R$ ${entryAmount.toFixed(2)}, pago: R$ ${paid.toFixed(2)})`,
          is_recurring: false,
          recurring_day: null,
          recurring_count: null,
          recurring_frequency: null,
          paid_date: null,
          appointment_id: entryToPay.appointment_id || null,
          installments: 1,
          paid_by: null,
          status: 'pending',
        });
        
        toast.info(`Pagamento parcial registrado. Restante de R$ ${remainder.toFixed(2)} permanece pendente até ser quitado.`);
      }

      if (entryToPay.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    } else {
      await updateEntry.mutateAsync({
        id: entryToPay.id,
        payment_method_id: paymentMethodId || null,
        bank_id: paymentBankId || null,
        installments: parseInt(paymentInstallments) || 1,
      });
    }
    
    setPayDialogOpen(false);
    setEntryToPay(null);
    setPaymentMethodId('');
    setPaymentBankId('');
    setPaymentInstallments('1');
    setPaidAmount('');
    setCreateBoletoReminder(false);
    setConfirmationStep(false);
  };

  // Cancel/reverse payment
  const openCancelDialog = (entry: any) => {
    setEntryToCancel(entry);
    setCancelDialogOpen(true);
  };

  const handleCancelPayment = async () => {
    if (!entryToCancel) return;
    
    const originalAmount = Number(entryToCancel.original_amount || entryToCancel.amount);
    const wasPartial = entryToCancel.notes?.includes('Pagamento parcial');
    
    await updateEntry.mutateAsync({
      id: entryToCancel.id,
      amount: originalAmount,
      original_amount: null,
      status: 'pending' as const,
      paid_date: null,
      notes: wasPartial 
        ? `Baixa cancelada em ${format(new Date(), 'dd/MM/yyyy HH:mm')}. Valor original restaurado: R$ ${originalAmount.toFixed(2)}`
        : entryToCancel.notes 
          ? `${entryToCancel.notes} | Baixa cancelada em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
          : `Baixa cancelada em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    });

    if (wasPartial) {
      const baseDesc = entryToCancel.description.replace(/\s*\(restante.*?\)$/i, '');
      const remainderEntries = payables.filter(e => 
        e.id !== entryToCancel.id &&
        e.status === 'pending' &&
        e.description.includes(baseDesc) &&
        e.description.includes('(restante)')
      );
      
      for (const re of remainderEntries) {
        await deleteEntry.mutateAsync(re.id);
      }
    }

    if (entryToCancel.appointment_id) {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    }
    queryClient.invalidateQueries({ queryKey: ['reminders'] });

    toast.success('Baixa cancelada e valor restaurado com sucesso.');
    setCancelDialogOpen(false);
    setEntryToCancel(null);
  };

  const getStatusDisplay = (entry: any) => {
    if (entry.status === 'paid') {
      const isPartialPaid = entry.notes?.includes('Pagamento parcial');
      if (isPartialPaid) {
        return <span className="text-sm font-semibold text-yellow-600">Parcialmente Pago</span>;
      }
      return <span className="text-sm font-semibold text-green-600">Pago</span>;
    }
    const dueDate = parseISO(entry.due_date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Use per-entry tolerance, fallback to global setting
    const toleranceDays = (entry as any).overdue_tolerance_days ?? (settings?.overdue_days_threshold ?? 0);
    const overdueDate = addDays(dueDate, toleranceDays);
    
    if (isAfter(today, overdueDate)) {
      return <span className="text-sm font-semibold text-red-600">Atrasada</span>;
    }
    return <span className="text-sm font-semibold text-muted-foreground">Pendente</span>;
  };

  // Batch payment logic
  const toggleEntrySelection = (entryId: string) => {
    setSelectedEntryIds(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEntryIds.size === pendingFiltered.length) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(pendingFiltered.map(e => e.id)));
    }
  };

  const selectedEntries = useMemo(() => 
    filteredPayables.filter(e => selectedEntryIds.has(e.id) && e.status !== 'paid'),
    [filteredPayables, selectedEntryIds]
  );

  const batchTotal = useMemo(() => 
    selectedEntries.reduce((sum, e) => sum + Number(e.amount), 0),
    [selectedEntries]
  );

  const openBatchPayDialog = () => {
    if (selectedEntries.length === 0) {
      toast.error('Selecione ao menos uma conta pendente');
      return;
    }
    setBatchPaymentMethodId('');
    setBatchPaymentBankId('');
    setBatchConfirmStep(false);
    setBatchPayDialogOpen(true);
  };

  const handleBatchConfirm = async () => {
    if (!batchPaymentMethodId) {
      toast.error('Selecione a forma de pagamento');
      return;
    }
    
    for (const entry of selectedEntries) {
      await updateEntry.mutateAsync({
        id: entry.id,
        status: 'paid' as const,
        paid_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method_id: batchPaymentMethodId || null,
        bank_id: batchPaymentBankId || null,
        original_amount: Number(entry.amount),
      });
    }

    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['reminders'] });

    toast.success(`${selectedEntries.length} conta(s) pagas com sucesso! Total: R$ ${batchTotal.toFixed(2)}`);
    setBatchPayDialogOpen(false);
    setSelectedEntryIds(new Set());
    setBatchMode(false);
  };

  const batchSelectedPaymentMethod = activePaymentMethods.find(pm => pm.id === batchPaymentMethodId);
  const batchSelectedBank = activeBanks.find(b => b.id === batchPaymentBankId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 pb-3">
        <CardTitle className="text-base">Contas a Pagar</CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <AdvancedFilters
            groups={filterGroups}
            selectedFilters={selectedFilters}
            onFilterChange={handleFilterChange}
          />
          <Button
            variant={batchMode ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => {
              setBatchMode(!batchMode);
              setSelectedEntryIds(new Set());
            }}
          >
            <ListChecks className="h-3.5 w-3.5" />
            {batchMode ? 'Cancelar' : 'Baixa em Lote'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 px-2 text-[11px] gap-1">
                <Plus className="h-3.5 w-3.5" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Nova Conta a Pagar</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-4">
                  <div>
                    <Label>Data de Vencimento</Label>
                    <Input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nome da Conta</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Descrição da conta"
                    />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conta Bancária (de onde sai)</Label>
                    <Select value={form.bank_id} onValueChange={(v) => setForm({ ...form, bank_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBanks.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Dias de tolerância (atraso)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.overdue_tolerance_days}
                      onChange={(e) => setForm({ ...form, overdue_tolerance_days: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Dias após o vencimento antes de marcar como "Atrasada"
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_recurring}
                      onCheckedChange={(checked) => setForm({ ...form, is_recurring: checked })}
                    />
                    <Label>Conta recorrente</Label>
                  </div>
                  {form.is_recurring && (
                    <div className="space-y-4 p-3 border rounded-lg bg-muted/30">
                      <div>
                        <Label>Frequência</Label>
                        <Select value={form.recurring_frequency} onValueChange={(v) => setForm({ ...form, recurring_frequency: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Semanal</SelectItem>
                            <SelectItem value="biweekly">Quinzenal</SelectItem>
                            <SelectItem value="monthly">Mensal</SelectItem>
                            <SelectItem value="quarterly">Trimestral</SelectItem>
                            <SelectItem value="annual">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantidade de Recorrências</Label>
                        <Input
                          type="number"
                          min="1"
                          value={form.recurring_count}
                          onChange={(e) => setForm({ ...form, recurring_count: e.target.value })}
                          placeholder="Quantas vezes esse pagamento será feito"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={form.split_value}
                          onCheckedChange={(checked) => setForm({ ...form, split_value: checked })}
                        />
                        <Label className="text-sm">
                          Dividir valor total pelas {form.recurring_count || 1} recorrências
                        </Label>
                      </div>
                      {parseInt(form.recurring_count) > 1 && parseFloat(form.amount) > 0 && (
                        <div className="text-sm text-muted-foreground p-2 bg-background rounded border">
                          {form.split_value ? (
                            <span>
                              Valor por parcela: <strong>R$ {(parseFloat(form.amount) / parseInt(form.recurring_count)).toFixed(2)}</strong>
                              <br />
                              Total: R$ {parseFloat(form.amount).toFixed(2)} em {form.recurring_count}x
                            </span>
                          ) : (
                            <span>
                              Valor por parcela: <strong>R$ {parseFloat(form.amount).toFixed(2)}</strong> (integral)
                              <br />
                              Total: R$ {(parseFloat(form.amount) * parseInt(form.recurring_count)).toFixed(2)} em {form.recurring_count}x
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Parcela</Label>
                      <Input
                        type="number"
                        min="1"
                        value={form.installments}
                        onChange={(e) => setForm({ ...form, installments: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Valor</Label>
                      <CurrencyInput
                        value={form.amount}
                        onValueChange={(value) => setForm({ ...form, amount: String(value) })}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <Button onClick={handleSubmit} className="w-full">
                    Adicionar
                  </Button>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Batch mode bar */}
        {batchMode && (
          <div className="flex items-center justify-between mb-3 p-2.5 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedEntryIds.size === pendingFiltered.length && pendingFiltered.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs font-medium">
                {selectedEntryIds.size} parcela(s) selecionada(s)
              </span>
              {selectedEntryIds.size > 0 && (
                <Badge variant="outline" className="text-[11px] tabular-nums">
                  Total: R$ {batchTotal.toFixed(2)}
                </Badge>
              )}
            </div>
            <Button 
              size="sm" 
              onClick={openBatchPayDialog} 
              disabled={selectedEntryIds.size === 0}
              className="h-8 text-xs bg-green-600 hover:bg-green-700"
            >
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              Dar Baixa ({selectedEntryIds.size})
            </Button>
          </div>
        )}

        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                {batchMode && <TableHead className="w-10" />}
                <TableHead className="text-[11px]">Data</TableHead>
                <TableHead className="text-[11px]">Descrição</TableHead>
                <TableHead className="text-[11px]">Categoria</TableHead>
                <TableHead className="text-[11px]">Forma Pgto</TableHead>
                <TableHead className="text-[11px]">Valor</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={batchMode ? 8 : 7} className="text-center py-8 text-xs text-muted-foreground">
                    Nenhuma conta encontrada para o período selecionado
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayables.map((entry) => (
                  <TableRow key={entry.id}>
                    {batchMode && (
                      <TableCell className="py-2">
                        {entry.status !== 'paid' && (
                          <Checkbox
                            checked={selectedEntryIds.has(entry.id)}
                            onCheckedChange={() => toggleEntrySelection(entry.id)}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-xs py-2 tabular-nums whitespace-nowrap">{format(parseISO(entry.due_date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-xs py-2 max-w-[280px] truncate" title={entry.description}>{entry.description}</TableCell>
                    <TableCell className="text-[11px] py-2 text-muted-foreground">
                      {entry.category?.name || '-'}
                    </TableCell>
                    <TableCell className="text-[11px] py-2">
                      {entry.payment_method?.name || '-'}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-red-600 font-medium tabular-nums">
                      R$ {Number(entry.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {getStatusDisplay(entry)}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {entry.status !== 'paid' && !batchMode && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => openPayDialog(entry)} 
                            className="h-7 px-2 gap-1 text-[11px] text-green-700 border-green-300 hover:bg-green-50"
                          >
                            <DollarSign className="h-3 w-3" />
                            Dar Baixa
                          </Button>
                        )}
                        {entry.status === 'paid' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => openPayDialog(entry, true)} 
                              title="Editar pagamento"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => openCancelDialog(entry)} 
                              title="Cancelar baixa"
                            >
                              <Undo2 className="h-3.5 w-3.5 text-orange-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>

      {/* Cancel Payment Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Baixa</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja cancelar a baixa de "{entryToCancel?.description}"?
              {entryToCancel?.notes?.includes('Pagamento parcial') && (
                <span className="block mt-2 text-orange-600 font-medium">
                  ⚠ O valor restante pendente também será removido e o valor original será restaurado.
                </span>
              )}
              <span className="block mt-2">
                O status voltará para <strong>Pendente</strong> e o valor original de{' '}
                <strong>R$ {Number(entryToCancel?.original_amount || entryToCancel?.amount || 0).toFixed(2)}</strong> será restaurado.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelPayment} className="bg-orange-600 text-white hover:bg-orange-700">
              <Undo2 className="h-4 w-4 mr-2" />
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Payment Dialog */}
      <Dialog open={batchPayDialogOpen} onOpenChange={(open) => {
        setBatchPayDialogOpen(open);
        if (!open) setBatchConfirmStep(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{batchConfirmStep ? 'Confirmar Baixa em Lote' : 'Baixa em Lote'}</DialogTitle>
          </DialogHeader>

          {batchConfirmStep ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Parcelas selecionadas:</span>
                  <span className="font-bold tabular-nums">{selectedEntries.length}</span>
                </div>
                <Separator />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {selectedEntries.map(e => (
                    <div key={e.id} className="flex justify-between text-[11px]">
                      <span className="truncate mr-2">{e.description}</span>
                      <span className="font-medium shrink-0 tabular-nums">R$ {Number(e.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Valor total:</span>
                  <span className="font-bold text-green-600 tabular-nums">R$ {batchTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Forma de pagamento:</span>
                  <span className="font-medium">{batchSelectedPaymentMethod?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Conta bancária:</span>
                  <span className="font-medium">{batchSelectedBank?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium tabular-nums">{format(new Date(), 'dd/MM/yyyy')}</span>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setBatchConfirmStep(false)}>Voltar</Button>
                <Button size="sm" onClick={handleBatchConfirm} className="bg-green-600 hover:bg-green-700">
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Confirmar Pagamento
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">{selectedEntries.length} parcela(s) selecionada(s)</p>
                <p className="text-base font-bold text-green-600 tabular-nums">Total: R$ {batchTotal.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={batchPaymentMethodId} onValueChange={setBatchPaymentMethodId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activePaymentMethods.map(pm => (
                      <SelectItem key={pm.id} value={pm.id} className="text-xs">{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conta Bancária</Label>
                <Select value={batchPaymentBankId} onValueChange={setBatchPaymentBankId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeBanks.map(bank => (
                      <SelectItem key={bank.id} value={bank.id} className="text-xs">{bank.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setBatchPayDialogOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={() => {
                  if (!batchPaymentMethodId) { toast.error('Selecione a forma de pagamento'); return; }
                  setBatchConfirmStep(true);
                }} className="bg-green-600 hover:bg-green-700">
                  Revisar e Confirmar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment / Edit Payment Dialog with Confirmation Step */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => {
        setPayDialogOpen(open);
        if (!open) setConfirmationStep(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditingPayment 
                ? 'Editar Pagamento' 
                : confirmationStep 
                  ? 'Confirmar Baixa' 
                  : 'Dar Baixa'}
            </DialogTitle>
          </DialogHeader>

          {/* CONFIRMATION STEP */}
          {confirmationStep && !isEditingPayment ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Conta:</span>
                  <span className="font-medium">{entryToPay?.description}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor da conta:</span>
                  <span className="font-medium">R$ {entryAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor pago:</span>
                  <span className="font-bold text-green-600">R$ {paid.toFixed(2)}</span>
                </div>
                {isPartial && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restante pendente:</span>
                    <span className="font-bold text-orange-600">R$ {remainder.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Forma de pagamento:</span>
                  <span className="font-medium">{selectedPaymentMethod?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Conta bancária:</span>
                  <span className="font-medium">{selectedBank?.name || '-'}</span>
                </div>
                {showInstallments && parseInt(paymentInstallments) > 1 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parcelas:</span>
                    <span className="font-medium">{paymentInstallments}x de R$ {(paid / parseInt(paymentInstallments)).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">{format(new Date(), 'dd/MM/yyyy')}</span>
                </div>
              </div>

              {isPartial && (
                <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-700 dark:text-orange-400 text-xs">
                    O restante de R$ {remainder.toFixed(2)} será mantido como pendência em Contas a Pagar até ser quitado.
                  </AlertDescription>
                </Alert>
              )}

              {isBoleto && createBoletoReminder && (
                <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs">
                    Um lembrete será criado para verificar o pagamento na data de vencimento.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setConfirmationStep(false)}>
                  Voltar
                </Button>
                <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Pagamento
                </Button>
              </div>
            </div>
          ) : (
            /* INPUT STEP */
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Conta: <span className="font-medium text-foreground">{entryToPay?.description}</span>
                </p>
                {!isEditingPayment && (
                  <p className="text-sm text-muted-foreground">
                    Valor total: <span className="font-medium text-foreground">R$ {entryAmount.toFixed(2)}</span>
                  </p>
                )}
              </div>

              <div>
                <Label>Valor pago</Label>
                <CurrencyInput
                  value={paidAmount}
                  onValueChange={(value) => setPaidAmount(String(value))}
                  placeholder="0,00"
                />
                {!isEditingPayment && entryToPay && paid > 0 && paid < entryAmount && (
                  <p className="text-xs text-orange-600 mt-1">
                    ⚠ Pagamento parcial — restante de R$ {(entryAmount - paid).toFixed(2)} permanecerá pendente até ser quitado.
                  </p>
                )}
              </div>
              
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePaymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Conta Bancária (origem do pagamento)</Label>
                <Select value={paymentBankId} onValueChange={setPaymentBankId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBanks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showInstallments && maxInstallments > 1 && (
                <div>
                  <Label>Número de Parcelas</Label>
                  <Select value={paymentInstallments} onValueChange={setPaymentInstallments}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione as parcelas" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num}x {num > 1 && entryToPay ? `de R$ ${(entryAmount / num).toFixed(2)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isEditingPayment && isBoleto && (
                <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    <div className="flex items-center gap-2 mt-1">
                      <Switch
                        checked={createBoletoReminder}
                        onCheckedChange={setCreateBoletoReminder}
                      />
                      <Label className="text-sm cursor-pointer">
                        Criar lembrete para verificar pagamento na data de vencimento
                      </Label>
                    </div>
                    {createBoletoReminder && (
                      <p className="text-xs mt-2">
                        Um lembrete será criado para o dia {entryToPay?.due_date ? format(parseISO(entryToPay.due_date + 'T12:00:00'), 'dd/MM/yyyy') : '-'} 
                        para verificar se o boleto foi pago. A conta permanecerá pendente até a baixa manual.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
                  Cancelar
                </Button>
                {isEditingPayment ? (
                  <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700">
                    <Check className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </Button>
                ) : (
                  <Button onClick={handleGoToConfirmation} className="bg-green-600 hover:bg-green-700">
                    Revisar e Confirmar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
