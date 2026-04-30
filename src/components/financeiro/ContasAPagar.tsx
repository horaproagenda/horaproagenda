import { useState, useMemo } from 'react';
import { format, parseISO, isAfter, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Plus, Pencil, Trash2, Check, Calendar, AlertCircle } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { useReminders } from '@/hooks/useReminders';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdvancedFilters, type FilterGroup } from '@/components/shared/AdvancedFilters';
import { calculateRecurringValues } from '@/lib/recurringEntryCalculation';

export function ContasAPagar() {
  const { payables, createEntry, updateEntry, deleteEntry } = useFinancialEntries();
  const { expenseCategories } = useFinancialCategories();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeBanks } = useBanks();
  const { createReminder } = useReminders();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
    date: ['month'],
    status: ['pending'],
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<any>(null);
  const [deleteRecurring, setDeleteRecurring] = useState(false);
  const [editRecurring, setEditRecurring] = useState(false);
  const [showEditRecurringOption, setShowEditRecurringOption] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [entryToPay, setEntryToPay] = useState<any>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [paymentBankId, setPaymentBankId] = useState<string>('');
  const [paymentInstallments, setPaymentInstallments] = useState<string>('1');
  const [createBoletoReminder, setCreateBoletoReminder] = useState(false);
  
  const [form, setForm] = useState({
    description: '',
    amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    paid_date: '',
    category_id: '',
    payment_method_id: '',
    bank_id: '',
    is_recurring: false,
    recurring_frequency: 'monthly',
    installments: '1',
    recurring_count: '1',
    split_value: false,
  });

  // Filter groups
  const filterGroups: FilterGroup[] = useMemo(() => [
    {
      id: 'date',
      label: 'Período',
      options: [
        { value: 'today', label: 'Hoje' },
        { value: 'month', label: 'Este mês' },
      ],
      multiSelect: false,
    },
    {
      id: 'status',
      label: 'Status',
      options: [
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
      // Status filter
      if (!statusFilter.includes('all')) {
        if (statusFilter.includes('pending') && entry.status === 'paid') return false;
        if (statusFilter.includes('paid') && entry.status !== 'paid') return false;
      }
      
      // Date filter
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
  const resetForm = () => {
    setForm({
      description: '',
      amount: '',
      due_date: format(new Date(), 'yyyy-MM-dd'),
      paid_date: '',
      category_id: '',
      payment_method_id: '',
      bank_id: '',
      is_recurring: false,
      recurring_frequency: 'monthly',
      installments: '1',
      recurring_count: '1',
      split_value: false,
    });
    setEditingEntry(null);
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setForm({
      description: entry.description.replace(/\s*\(\d+\/\d+\)$/, ''), // Remove number suffix for editing
      amount: entry.amount.toString(),
      due_date: entry.due_date,
      paid_date: entry.paid_date || '',
      category_id: entry.category_id || '',
      payment_method_id: entry.payment_method_id || '',
      bank_id: entry.bank_id || '',
      is_recurring: entry.is_recurring || false,
      recurring_frequency: entry.recurring_frequency || 'monthly',
      installments: entry.installments?.toString() || '1',
      recurring_count: entry.recurring_count?.toString() || '1',
      split_value: false,
    });
    // Show recurring option if entry is part of a recurring series
    setShowEditRecurringOption(entry.is_recurring);
    setEditRecurring(false);
    setDialogOpen(true);
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
    
    const calc = calculateRecurringValues({
      amount: totalAmount,
      installments: recurringCount,
      isTotalValue: form.split_value,
    });
    
    const amountPerEntry = calc.perInstallmentAmount;

    if (editingEntry) {
      // Update this entry
      await updateEntry.mutateAsync({ 
        id: editingEntry.id, 
        type: 'payable',
        description: form.description,
        amount: amountPerEntry,
        due_date: form.due_date,
        paid_date: form.paid_date || null,
        category_id: form.category_id || null,
        payment_method_id: form.payment_method_id || null,
        bank_id: form.bank_id || null,
        is_recurring: form.is_recurring,
        recurring_frequency: form.is_recurring ? form.recurring_frequency : null,
        recurring_count: form.is_recurring ? recurringCount : null,
        installments: parseInt(form.installments) || 1,
        status: form.paid_date ? 'paid' as const : 'pending' as const,
      });

      // If editRecurring is true, also update all future related entries
      if (editRecurring && editingEntry.is_recurring) {
        const baseDescription = editingEntry.description.replace(/\s*\(\d+\/\d+\)$/, '');
        const relatedEntries = payables.filter(e => 
          e.description.replace(/\s*\(\d+\/\d+\)$/, '') === baseDescription &&
          e.id !== editingEntry.id &&
          parseISO(e.due_date) > parseISO(editingEntry.due_date)
        );
        
        for (const entry of relatedEntries) {
          await updateEntry.mutateAsync({
            id: entry.id,
            description: form.description,
            amount: amountPerEntry,
            category_id: form.category_id || null,
            payment_method_id: form.payment_method_id || null,
            bank_id: form.bank_id || null,
          });
        }
      }
    } else {
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
          });
        }
      } else {
        await createEntry.mutateAsync({
          type: 'payable',
          description: form.description,
          amount: amountPerEntry,
          due_date: form.due_date,
          paid_date: form.paid_date || null,
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
          status: form.paid_date ? 'paid' : 'pending',
        });
      }
    }
    setDialogOpen(false);
    resetForm();
  };

  const openPayDialog = (entry: any) => {
    setEntryToPay(entry);
    setPaymentMethodId(entry.payment_method_id || '');
    setPaymentBankId(entry.bank_id || '');
    setPaymentInstallments(entry.installments?.toString() || '1');
    setCreateBoletoReminder(false);
    setPayDialogOpen(true);
  };

  // Check if selected payment method is "Boleto"
  const selectedPaymentMethod = activePaymentMethods.find(pm => pm.id === paymentMethodId);
  const isBoleto = selectedPaymentMethod?.name?.toLowerCase().includes('boleto');
  const isCard = selectedPaymentMethod?.name?.toLowerCase().includes('cartão') || 
                 selectedPaymentMethod?.name?.toLowerCase().includes('crédito');
  const showInstallments = isBoleto || isCard;
  const maxInstallments = selectedPaymentMethod?.max_installments || 1;

  const handleConfirmPayment = async () => {
    if (!entryToPay) return;
    
    const installmentCount = parseInt(paymentInstallments) || 1;
    
    // If boleto and user wants a reminder, create it
    if (isBoleto && createBoletoReminder && entryToPay.due_date) {
      await createReminder.mutateAsync({
        title: `Verificar pagamento de boleto: ${entryToPay.description}`,
        description: `Verificar se o boleto "${entryToPay.description}" no valor de R$ ${Number(entryToPay.amount).toFixed(2)} foi pago. Caso positivo, dar baixa no sistema.`,
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
    
    // Only mark as paid if not boleto OR if it's boleto and user is confirming payment
    if (!isBoleto || !createBoletoReminder) {
      await updateEntry.mutateAsync({
        id: entryToPay.id,
        status: 'paid' as const,
        paid_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method_id: paymentMethodId || null,
        bank_id: paymentBankId || null,
        installments: installmentCount,
      });
    } else {
      // For boleto with reminder, only update payment method but keep pending
      await updateEntry.mutateAsync({
        id: entryToPay.id,
        payment_method_id: paymentMethodId || null,
        bank_id: paymentBankId || null,
        installments: installmentCount,
      });
    }
    
    setPayDialogOpen(false);
    setEntryToPay(null);
    setPaymentMethodId('');
    setPaymentBankId('');
    setPaymentInstallments('1');
    setCreateBoletoReminder(false);
  };

  const handleMarkAsPaid = async (entry: any) => {
    openPayDialog(entry);
  };

  const handleChangeStatus = async (entry: any, newStatus: 'pending' | 'paid') => {
    await updateEntry.mutateAsync({
      id: entry.id,
      status: newStatus,
      paid_date: newStatus === 'paid' ? format(new Date(), 'yyyy-MM-dd') : null,
    });
  };

  const openDeleteDialog = (entry: any) => {
    setEntryToDelete(entry);
    setDeleteRecurring(false);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!entryToDelete) return;

    if (deleteRecurring && entryToDelete.is_recurring) {
      // Delete all recurring entries with similar description
      const baseDescription = entryToDelete.description.replace(/\s*\(\d+\/\d+\)$/, '');
      const relatedEntries = payables.filter(e => 
        e.description.replace(/\s*\(\d+\/\d+\)$/, '') === baseDescription &&
        parseISO(e.due_date) >= parseISO(entryToDelete.due_date)
      );
      
      for (const entry of relatedEntries) {
        await deleteEntry.mutateAsync(entry.id);
      }
    } else {
      await deleteEntry.mutateAsync(entryToDelete.id);
    }
    
    setDeleteDialogOpen(false);
    setEntryToDelete(null);
  };

  const getStatusBadge = (entry: any) => {
    if (entry.status === 'paid') {
      return <Badge className="bg-green-500 hover:bg-green-600">Pago</Badge>;
    }
    const dueDate = parseISO(entry.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isAfter(today, dueDate)) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle>Contas a Pagar</CardTitle>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Advanced Filters */}
          <AdvancedFilters
            groups={filterGroups}
            selectedFilters={selectedFilters}
            onFilterChange={handleFilterChange}
          />
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>{editingEntry ? 'Editar Conta' : 'Nova Conta a Pagar'}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Data de Vencimento</Label>
                      <Input
                        type="date"
                        value={form.due_date}
                        onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Data de Pagamento</Label>
                      <Input
                        type="date"
                        value={form.paid_date}
                        onChange={(e) => setForm({ ...form, paid_date: e.target.value })}
                      />
                    </div>
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
                    <Label>Forma de Pagamento</Label>
                    <Select value={form.payment_method_id} onValueChange={(v) => setForm({ ...form, payment_method_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a forma" />
                      </SelectTrigger>
                      <SelectContent>
                        {activePaymentMethods.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
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
                  {/* Option to edit all following entries for recurring entries */}
                  {editingEntry && showEditRecurringOption && (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                      <Switch
                        checked={editRecurring}
                        onCheckedChange={setEditRecurring}
                      />
                      <Label className="text-sm">
                        Editar também as parcelas seguintes
                      </Label>
                    </div>
                  )}
                  <Button onClick={handleSubmit} className="w-full">
                    {editingEntry ? 'Salvar' : 'Adicionar'}
                  </Button>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma conta encontrada para o período selecionado
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayables.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell>{entry.payment_method?.name || '-'}</TableCell>
                    <TableCell>{entry.installments || 1}x</TableCell>
                    <TableCell className="text-red-600 font-medium">
                      R$ {Number(entry.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={entry.status} 
                        onValueChange={(v: 'pending' | 'paid') => handleChangeStatus(entry, v)}
                      >
                        <SelectTrigger className="w-[110px] h-7 text-xs">
                          {getStatusBadge(entry)}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {entry.status === 'pending' && (
                          <Button variant="ghost" size="icon" onClick={() => handleMarkAsPaid(entry)} title="Marcar como pago">
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(entry)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir a conta "{entryToDelete?.description}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {entryToDelete?.is_recurring && (
            <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
              <Switch
                checked={deleteRecurring}
                onCheckedChange={setDeleteRecurring}
              />
              <Label className="text-sm">
                Excluir esta e todas as recorrências futuras
              </Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Confirmation Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Conta: <span className="font-medium text-foreground">{entryToPay?.description}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Valor: <span className="font-medium text-foreground">R$ {Number(entryToPay?.amount || 0).toFixed(2)}</span>
              </p>
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

            {/* Installments for boleto and card */}
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
                        {num}x {num > 1 && entryToPay ? `de R$ ${(Number(entryToPay.amount) / num).toFixed(2)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Boleto reminder option */}
            {isBoleto && (
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
                      Um lembrete será criado para o dia {entryToPay?.due_date ? format(parseISO(entryToPay.due_date), 'dd/MM/yyyy') : '-'} 
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
              <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4 mr-2" />
                {isBoleto && createBoletoReminder ? 'Salvar e Criar Lembrete' : 'Confirmar Pagamento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}