import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';

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
  const { payables, createEntry } = useFinancialEntries();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeBanks } = useBanks();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    is_recurring: false,
    recurring_frequency: 'monthly' as string,
    description: '',
    is_active: true,
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method_id: '',
    bank_id: '',
    is_recurring: false,
    recurring_frequency: 'monthly',
    installments: '1',
    is_total_value: true, // true = valor integral, false = valor dividido
  });

  // Create default categories if none exist
  useEffect(() => {
    if (categories.length === 0) {
      DEFAULT_CATEGORIES.forEach(cat => {
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

  const resetForm = () => {
    setForm({
      name: '',
      is_recurring: false,
      recurring_frequency: 'monthly',
      description: '',
      is_active: true,
    });
    setEditingCat(null);
  };

  const resetExpenseForm = () => {
    setExpenseForm({
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
    setSelectedCategoryId(null);
  };

  const openEdit = (cat: any) => {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      is_recurring: cat.is_recurring,
      recurring_frequency: 'monthly',
      description: cat.description || '',
      is_active: cat.is_active,
    });
    setDialogOpen(true);
  };

  const openExpenseDialog = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setExpenseDialogOpen(true);
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
        type: 'expense', // Always expense since this is for expense categories
        is_recurring: form.is_recurring,
        description: form.description,
        is_active: form.is_active,
      });
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleCreateExpense = async () => {
    if (!selectedCategoryId) return;

    const amount = parseFloat(expenseForm.amount) || 0;
    const installments = parseInt(expenseForm.installments) || 1;
    
    // Calculate per-installment amount if not total value
    const perInstallmentAmount = expenseForm.is_total_value 
      ? amount / installments 
      : amount;

    await createEntry.mutateAsync({
      type: 'payable',
      description: expenseForm.description,
      amount: perInstallmentAmount,
      due_date: expenseForm.due_date,
      category_id: selectedCategoryId,
      payment_method_id: expenseForm.payment_method_id || null,
      bank_id: expenseForm.bank_id || null,
      client_id: null,
      professional_id: null,
      notes: null,
      is_recurring: expenseForm.is_recurring,
      recurring_day: null,
      recurring_count: null,
      recurring_frequency: expenseForm.is_recurring ? expenseForm.recurring_frequency : null,
      paid_date: null,
      appointment_id: null,
      installments: installments,
      paid_by: null,
      status: 'pending',
    });

    setExpenseDialogOpen(false);
    resetExpenseForm();
  };

  // Group expenses by category
  const expensesByCategory = categories.map(cat => ({
    ...cat,
    expenses: payables.filter(e => e.category_id === cat.id),
    total: payables.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

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
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nome da categoria"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Descrição (opcional)"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_recurring}
                    onCheckedChange={(checked) => setForm({ ...form, is_recurring: checked })}
                  />
                  <Label>Categoria recorrente</Label>
                </div>
                {form.is_recurring && (
                  <div>
                    <Label>Frequência</Label>
                    <Select 
                      value={form.recurring_frequency} 
                      onValueChange={(v) => setForm({ ...form, recurring_frequency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                  />
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
        {/* Dialog for creating expense in a category */}
        <Dialog open={expenseDialogOpen} onOpenChange={(open) => { setExpenseDialogOpen(open); if (!open) resetExpenseForm(); }}>
          <DialogContent className="max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Nova Despesa</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4">
                <div>
                  <Label>Descrição</Label>
                  <Input
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="Descrição da despesa"
                  />
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input
                    type="date"
                    value={expenseForm.due_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, due_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select 
                    value={expenseForm.payment_method_id} 
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, payment_method_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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
                  <Select 
                    value={expenseForm.bank_id} 
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, bank_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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
                    checked={expenseForm.is_recurring}
                    onCheckedChange={(checked) => setExpenseForm({ ...expenseForm, is_recurring: checked })}
                  />
                  <Label>Despesa recorrente</Label>
                </div>
                {expenseForm.is_recurring && (
                  <div>
                    <Label>Frequência</Label>
                    <Select 
                      value={expenseForm.recurring_frequency} 
                      onValueChange={(v) => setExpenseForm({ ...expenseForm, recurring_frequency: v })}
                    >
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
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Parcelas</Label>
                    <Input
                      type="number"
                      min="1"
                      value={expenseForm.installments}
                      onChange={(e) => setExpenseForm({ ...expenseForm, installments: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                {parseInt(expenseForm.installments) > 1 && (
                  <div>
                    <Label>Tipo de Valor</Label>
                    <Select 
                      value={expenseForm.is_total_value ? 'total' : 'per_installment'} 
                      onValueChange={(v) => setExpenseForm({ ...expenseForm, is_total_value: v === 'total' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Valor total (dividido pelas parcelas)</SelectItem>
                        <SelectItem value="per_installment">Valor por parcela</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                      {expenseForm.is_total_value 
                        ? `Cada parcela: R$ ${(parseFloat(expenseForm.amount || '0') / parseInt(expenseForm.installments || '1')).toFixed(2)}`
                        : `Total: R$ ${(parseFloat(expenseForm.amount || '0') * parseInt(expenseForm.installments || '1')).toFixed(2)}`
                      }
                    </p>
                  </div>
                )}
                <Button onClick={handleCreateExpense} className="w-full">
                  Criar Despesa
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <ScrollArea className="h-[500px]">
          <Accordion type="multiple" className="w-full">
            {expensesByCategory.map((cat) => (
              <AccordionItem key={cat.id} value={cat.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={cat.type === 'income' ? 'default' : 'secondary'}>
                        {cat.type === 'income' ? 'Receita' : 'Despesa'}
                      </Badge>
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-muted-foreground text-sm">({cat.expenses.length} lançamentos)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cat.type === 'income' ? 'text-green-600' : 'text-red-600'}>
                        R$ {cat.total.toFixed(2)}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e) => { e.stopPropagation(); openExpenseDialog(cat.id); }}
                        title="Adicionar despesa"
                      >
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
                  {cat.expenses.length > 0 ? (
                    <div className="space-y-2 pl-4">
                      {cat.expenses.map((expense) => (
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
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
