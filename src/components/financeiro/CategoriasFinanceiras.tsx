import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { calculateRecurringValues } from '@/lib/recurringEntryCalculation';

const DEFAULT_CATEGORIES = [
  { name: 'Despesa Financeira', type: 'expense' },
  { name: 'Despesa Fixa', type: 'expense' },
  { name: 'Despesa Variável', type: 'expense' },
  { name: 'Fornecedor', type: 'expense' },
  { name: 'Funcionários', type: 'expense' },
  { name: 'Imposto', type: 'expense' },
  { name: 'Receita', type: 'income' },
  { name: 'Transferência', type: 'expense' },
];

export function CategoriasFinanceiras() {
  const { categories, createCategory, updateCategory, deleteCategory } = useFinancialCategories();
  const { payables, receivables, createEntry } = useFinancialEntries();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeBanks } = useBanks();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryDialogType, setEntryDialogType] = useState<'income' | 'expense'>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');
  const [form, setForm] = useState({
    name: '',
    is_recurring: false,
    recurring_frequency: 'monthly' as string,
    description: '',
    is_active: true,
  });

  const [entryForm, setEntryForm] = useState({
    description: '',
    amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method_id: '',
    bank_id: '',
    is_recurring: false,
    recurring_frequency: 'monthly',
    installments: '1',
    is_total_value: true,
  });

  // Create default categories if none exist (deduplicated)
  useEffect(() => {
    if (categories.length === 0) {
      const seen = new Set<string>();
      DEFAULT_CATEGORIES.forEach(cat => {
        const key = `${cat.name}|${cat.type}`;
        if (seen.has(key)) return;
        seen.add(key);
        createCategory.mutate({
          name: cat.name,
          type: cat.type as 'income' | 'expense',
          is_recurring: false,
          description: '',
          is_active: true,
        });
      });
    }
  }, [categories.length]);

  // Deduplicated active categories
  const dedupedCategories = (() => {
    const seen = new Map<string, any>();
    categories.forEach(cat => {
      const key = `${cat.name.toLowerCase().trim()}|${cat.type}`;
      if (!seen.has(key)) {
        seen.set(key, cat);
      }
    });
    return Array.from(seen.values());
  })();

  const expenseCats = dedupedCategories.filter(c => c.type === 'expense');
  const incomeCats = dedupedCategories.filter(c => c.type === 'income');

  const resetForm = () => {
    setForm({ name: '', is_recurring: false, recurring_frequency: 'monthly', description: '', is_active: true });
    setEditingCat(null);
  };

  const resetEntryForm = () => {
    setEntryForm({
      description: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method_id: '', bank_id: '', is_recurring: false, recurring_frequency: 'monthly',
      installments: '1', is_total_value: true,
    });
    setSelectedCategoryId(null);
  };

  const openEdit = (cat: any) => {
    setEditingCat(cat);
    setNewCatType(cat.type);
    setForm({ name: cat.name, is_recurring: cat.is_recurring, recurring_frequency: 'monthly', description: cat.description || '', is_active: cat.is_active });
    setDialogOpen(true);
  };

  const openEntryDialog = (categoryId: string, type: 'income' | 'expense') => {
    setSelectedCategoryId(categoryId);
    setEntryDialogType(type);
    setEntryDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (editingCat) {
      await updateCategory.mutateAsync({
        id: editingCat.id,
        name: form.name,
        is_recurring: form.is_recurring,
        description: form.description,
        is_active: form.is_active,
      });
    } else {
      await createCategory.mutateAsync({
        name: form.name,
        type: newCatType,
        is_recurring: form.is_recurring,
        description: form.description,
        is_active: form.is_active,
      });
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleCreateEntry = async () => {
    if (!selectedCategoryId) return;

    const amount = parseFloat(entryForm.amount) || 0;
    const installments = parseInt(entryForm.installments) || 1;

    const perInstallmentAmount = entryForm.is_total_value
      ? amount / installments
      : amount;

    const entryType = entryDialogType === 'income' ? 'receivable' : 'payable';

    await createEntry.mutateAsync({
      type: entryType,
      description: entryForm.description,
      amount: perInstallmentAmount,
      due_date: entryForm.due_date,
      category_id: selectedCategoryId,
      payment_method_id: entryForm.payment_method_id || null,
      bank_id: entryForm.bank_id || null,
      client_id: null,
      professional_id: null,
      notes: null,
      is_recurring: entryForm.is_recurring,
      recurring_day: null,
      recurring_count: null,
      recurring_frequency: entryForm.is_recurring ? entryForm.recurring_frequency : null,
      paid_date: null,
      appointment_id: null,
      installments: installments,
      paid_by: null,
      status: 'pending',
    });

    setEntryDialogOpen(false);
    resetEntryForm();
  };

  // Group entries by category
  const expensesByCategory = expenseCats.map(cat => ({
    ...cat,
    entries: payables.filter(e => e.category_id === cat.id),
    total: payables.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  const incomesByCategory = incomeCats.map(cat => ({
    ...cat,
    entries: receivables.filter(e => e.category_id === cat.id),
    total: receivables.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  const isIncome = entryDialogType === 'income';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Categorias</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                {!editingCat && (
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newCatType} onValueChange={(v) => setNewCatType(v as 'income' | 'expense')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Despesa</SelectItem>
                        <SelectItem value="income">Receita</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da categoria" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição (opcional)" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_recurring} onCheckedChange={(checked) => setForm({ ...form, is_recurring: checked })} />
                  <Label>Categoria recorrente</Label>
                </div>
                {form.is_recurring && (
                  <div>
                    <Label>Frequência</Label>
                    <Select value={form.recurring_frequency} onValueChange={(v) => setForm({ ...form, recurring_frequency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="bimonthly">Bimestral</SelectItem>
                        <SelectItem value="quarterly">Trimestral</SelectItem>
                        <SelectItem value="semiannual">Semestral</SelectItem>
                        <SelectItem value="annual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                  <Label>Ativo</Label>
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingCat ? 'Salvar' : 'Criar Categoria'}
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Dialog for creating entry (income or expense) in a category */}
        <Dialog open={entryDialogOpen} onOpenChange={(open) => { setEntryDialogOpen(open); if (!open) resetEntryForm(); }}>
          <DialogContent className="max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{isIncome ? 'Nova Receita' : 'Nova Despesa'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                <div>
                  <Label>Descrição</Label>
                  <Input
                    value={entryForm.description}
                    onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                    placeholder={isIncome ? 'Descrição da receita' : 'Descrição da despesa'}
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={selectedCategoryId || ''} onValueChange={(v) => setSelectedCategoryId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(isIncome ? incomeCats : expenseCats).map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input type="date" value={entryForm.due_date} onChange={(e) => setEntryForm({ ...entryForm, due_date: e.target.value })} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={entryForm.payment_method_id} onValueChange={(v) => setEntryForm({ ...entryForm, payment_method_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {activePaymentMethods.map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isIncome ? 'Conta Bancária beneficiada' : 'Conta Bancária (de onde sai)'}</Label>
                  <Select value={entryForm.bank_id} onValueChange={(v) => setEntryForm({ ...entryForm, bank_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {activeBanks.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={entryForm.is_recurring}
                    onCheckedChange={(checked) => setEntryForm({ ...entryForm, is_recurring: checked })}
                  />
                  <Label>{isIncome ? 'Receita recorrente' : 'Despesa recorrente'}</Label>
                </div>
                {entryForm.is_recurring && (
                  <div>
                    <Label>Frequência</Label>
                    <Select value={entryForm.recurring_frequency} onValueChange={(v) => setEntryForm({ ...entryForm, recurring_frequency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="quarterly">Trimestral</SelectItem>
                        <SelectItem value="annual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Parcelas</Label>
                    <Input type="number" min="1" value={entryForm.installments} onChange={(e) => setEntryForm({ ...entryForm, installments: e.target.value })} />
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <CurrencyInput value={entryForm.amount} onValueChange={(value) => setEntryForm({ ...entryForm, amount: String(value) })} placeholder="0,00" />
                  </div>
                </div>
                {parseInt(entryForm.installments) > 1 && (
                  <div>
                    <Label>Tipo de Valor</Label>
                    <Select value={entryForm.is_total_value ? 'total' : 'per_installment'} onValueChange={(v) => setEntryForm({ ...entryForm, is_total_value: v === 'total' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Valor total (diluído nas parcelas)</SelectItem>
                        <SelectItem value="per_installment">Valor integral por parcela</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                      {entryForm.is_total_value
                        ? `Cada parcela: R$ ${(parseFloat(entryForm.amount || '0') / parseInt(entryForm.installments || '1')).toFixed(2)}`
                        : `Total: R$ ${(parseFloat(entryForm.amount || '0') * parseInt(entryForm.installments || '1')).toFixed(2)}`
                      }
                    </p>
                  </div>
                )}
                <Button onClick={handleCreateEntry} className="w-full">
                  {isIncome ? 'Criar Receita' : 'Criar Despesa'}
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <ScrollArea className="h-[500px]">
          {/* Income Categories */}
          {incomeCats.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-green-600 mb-2">Receitas</h3>
              <Accordion type="multiple" className="w-full">
                {incomesByCategory.map((cat) => (
                  <AccordionItem key={cat.id} value={cat.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Receita</Badge>
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-muted-foreground text-sm">({cat.entries.length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">R$ {cat.total.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEntryDialog(cat.id, 'income'); }} title="Adicionar receita">
                            <Plus className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(cat); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteCategory.mutate(cat.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {cat.entries.length > 0 ? (
                        <div className="space-y-2 pl-4">
                          {cat.entries.map((entry) => (
                            <div key={entry.id} className="flex justify-between items-center py-2 border-b last:border-0">
                              <span>{entry.description}</span>
                              <span className="text-green-600">R$ {Number(entry.amount).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm pl-4">Nenhuma receita nesta categoria</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Expense Categories */}
          {expenseCats.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 mb-2">Despesas</h3>
              <Accordion type="multiple" className="w-full">
                {expensesByCategory.map((cat) => (
                  <AccordionItem key={cat.id} value={cat.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Despesa</Badge>
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-muted-foreground text-sm">({cat.entries.length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-red-600">R$ {cat.total.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEntryDialog(cat.id, 'expense'); }} title="Adicionar despesa">
                            <Plus className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(cat); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteCategory.mutate(cat.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {cat.entries.length > 0 ? (
                        <div className="space-y-2 pl-4">
                          {cat.entries.map((expense) => (
                            <div key={expense.id} className="flex justify-between items-center py-2 border-b last:border-0">
                              <span>{expense.description}</span>
                              <span className="text-red-600">R$ {Number(expense.amount).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm pl-4">Nenhuma despesa nesta categoria</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
