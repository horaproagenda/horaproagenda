import { useState } from 'react';
import { format, parseISO, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';

export function ContasAPagar() {
  const { payables, createEntry, updateEntry, deleteEntry } = useFinancialEntries();
  const { expenseCategories } = useFinancialCategories();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeBanks } = useBanks();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
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
    recurring_count: '1', // Quantidade de recorrências
    split_value: false, // Se true, divide o valor pela quantidade de recorrências
  });

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
      description: entry.description,
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
    setDialogOpen(true);
  };

  // Helper function to calculate next due date based on frequency
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
    
    // Calculate amount per entry (divided or integral)
    const amountPerEntry = form.is_recurring && form.split_value 
      ? totalAmount / recurringCount 
      : totalAmount;

    if (editingEntry) {
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
    } else {
      // Create recurring entries if enabled
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

  const handleMarkAsPaid = async (entry: any) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      status: 'paid' as const,
      paid_date: format(new Date(), 'yyyy-MM-dd'),
    });
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contas a Pagar</CardTitle>
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
                    <Input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingEntry ? 'Salvar' : 'Adicionar'}
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
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
              {payables.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{entry.payment_method?.name || '-'}</TableCell>
                  <TableCell>{entry.installments || 1}x</TableCell>
                  <TableCell className="text-red-600 font-medium">
                    R$ {Number(entry.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>{getStatusBadge(entry)}</TableCell>
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
                      <Button variant="ghost" size="icon" onClick={() => deleteEntry.mutate(entry.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {payables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma conta a pagar cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}