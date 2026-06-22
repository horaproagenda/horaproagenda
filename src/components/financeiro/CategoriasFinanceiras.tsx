import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import { Plus, Pencil, Trash2, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialEntries, FinancialEntry } from '@/hooks/useFinancialEntries';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { calculateRecurringValues } from '@/lib/recurringEntryCalculation';

const DEFAULT_CATEGORIES: { name: string; type: 'income' | 'expense' }[] = [
  // Receitas
  { name: 'Receita de Serviços', type: 'income' },
  { name: 'Receita de Produtos', type: 'income' },
  { name: 'Receita de Pacotes', type: 'income' },
  { name: 'Outras Receitas', type: 'income' },
  // Despesas
  { name: 'Aluguel', type: 'expense' },
  { name: 'Água e Luz', type: 'expense' },
  { name: 'Internet e Telefone', type: 'expense' },
  { name: 'Funcionários / Salários', type: 'expense' },
  { name: 'Comissões', type: 'expense' },
  { name: 'Impostos', type: 'expense' },
  { name: 'Fornecedores', type: 'expense' },
  { name: 'Material de Trabalho', type: 'expense' },
  { name: 'Marketing', type: 'expense' },
  { name: 'Manutenção', type: 'expense' },
  { name: 'Outras Despesas', type: 'expense' },
];


interface GroupedEntry {
  baseDescription: string;
  entries: FinancialEntry[];
  totalAmount: number;
  paidCount: number;
  pendingCount: number;
  isRecurring: boolean;
}

export function CategoriasFinanceiras() {
  const { categories, incomeCategories, expenseCategories, createCategory, updateCategory, deleteCategory } = useFinancialCategories();
  const { payables, receivables, createEntry, updateEntry } = useFinancialEntries();
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
    overdue_tolerance_days: '0',
  });

  // Detail view state
  const [detailGroup, setDetailGroup] = useState<GroupedEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Edit entry state
  const [editEntryDialogOpen, setEditEntryDialogOpen] = useState(false);
  const [editScope, setEditScope] = useState<'current' | 'all' | 'future' | 'following' | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);
  const [editingGroup, setEditingGroup] = useState<GroupedEntry | null>(null);
  const [editEntryForm, setEditEntryForm] = useState({
    description: '',
    category_id: '',
    bank_id: '',
    is_recurring: false,
    recurring_frequency: 'monthly',
    amount: '',
    installment_amount: '',
    installments: '1',
    overdue_tolerance_days: '0',
  });

  // Seed idempotente das categorias padrão: só dispara quando NÃO existe
  // nenhuma categoria do tipo (income/expense). A flag local + índice único
  // (lower(name), type) no banco evitam duplicatas em race-condition.
  const [seededDefaults, setSeededDefaults] = useState(false);
  useEffect(() => {
    if (seededDefaults) return;
    if (categories.length > 0) { setSeededDefaults(true); return; }
    setSeededDefaults(true);
    DEFAULT_CATEGORIES.forEach(cat => {
      createCategory.mutate({
        name: cat.name,
        type: cat.type,
        is_recurring: false,
        description: null,
        is_active: true,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);


  // Use deduplicated categories from hook
  const expenseCats = expenseCategories;
  const incomeCats = incomeCategories;

  // Group entries by base description (remove "(1/3)", "(restante)" etc.)
  const getBaseDescription = (desc: string) => {
    return desc
      .replace(/\s*\(\d+\/\d+\)\s*/g, '')
      .replace(/\s*\(restante.*?\)\s*/gi, '')
      .trim();
  };

  const groupEntries = (entries: FinancialEntry[]): GroupedEntry[] => {
    const groups = new Map<string, FinancialEntry[]>();
    entries.forEach(entry => {
      const base = getBaseDescription(entry.description);
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(entry);
    });
    return Array.from(groups.entries()).map(([baseDesc, entries]) => ({
      baseDescription: baseDesc,
      entries: entries.sort((a, b) => a.due_date.localeCompare(b.due_date)),
      totalAmount: entries.reduce((sum, e) => sum + Number(e.amount), 0),
      paidCount: entries.filter(e => e.status === 'paid').length,
      pendingCount: entries.filter(e => e.status !== 'paid').length,
      isRecurring: entries.length > 1 || entries.some(e => e.is_recurring),
    }));
  };

  const resetForm = () => {
    setForm({ name: '', is_recurring: false, recurring_frequency: 'monthly', description: '', is_active: true });
    setEditingCat(null);
  };

  const resetEntryForm = () => {
    setEntryForm({
      description: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method_id: '', bank_id: '', is_recurring: false, recurring_frequency: 'monthly',
      installments: '1', is_total_value: true, overdue_tolerance_days: '0',
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

  const getNextDueDate = (baseDate: string, frequency: string, index: number): string => {
    const date = new Date(baseDate + 'T12:00:00');
    switch (frequency) {
      case 'weekly': date.setDate(date.getDate() + (7 * index)); break;
      case 'biweekly': date.setDate(date.getDate() + (14 * index)); break;
      case 'monthly': date.setMonth(date.getMonth() + index); break;
      case 'quarterly': date.setMonth(date.getMonth() + (3 * index)); break;
      case 'annual': date.setFullYear(date.getFullYear() + index); break;
      default: date.setMonth(date.getMonth() + index);
    }
    return format(date, 'yyyy-MM-dd');
  };

  const handleCreateEntry = async () => {
    if (!selectedCategoryId) return;

    const amount = parseFloat(entryForm.amount) || 0;
    const installments = parseInt(entryForm.installments) || 1;
    const toleranceDays = parseInt(entryForm.overdue_tolerance_days) || 0;

    const calc = calculateRecurringValues({
      amount,
      installments,
      isTotalValue: entryForm.is_total_value,
    });

    if (!calc.isValid) {
      calc.errors.forEach(err => toast.error(err));
      return;
    }

    const selectedCat = [...expenseCats, ...incomeCats].find(c => c.id === selectedCategoryId);
    const entryType = selectedCat?.type === 'income' ? 'receivable' : 'payable';

    if (entryForm.is_recurring && installments > 1) {
      for (let i = 0; i < installments; i++) {
        const dueDate = getNextDueDate(entryForm.due_date, entryForm.recurring_frequency, i);
        await createEntry.mutateAsync({
          type: entryType,
          description: `${entryForm.description} (${i + 1}/${installments})`,
          amount: calc.perInstallmentAmount,
          due_date: dueDate,
          category_id: selectedCategoryId,
          payment_method_id: entryForm.payment_method_id || null,
          bank_id: entryForm.bank_id || null,
          client_id: null, professional_id: null,
          notes: `Modo: ${calc.mode === 'diluted' ? 'diluído' : 'integral'} | Total: R$ ${calc.totalAmount.toFixed(2)}`,
          is_recurring: true, recurring_day: null, recurring_count: installments,
          recurring_frequency: entryForm.recurring_frequency,
          paid_date: null, appointment_id: null, installments, paid_by: null, status: 'pending',
          overdue_tolerance_days: toleranceDays,
        } as any);
      }
      toast.success(`${installments} parcelas criadas`);
    } else {
      await createEntry.mutateAsync({
        type: entryType,
        description: entryForm.description,
        amount: calc.perInstallmentAmount,
        due_date: entryForm.due_date,
        category_id: selectedCategoryId,
        payment_method_id: entryForm.payment_method_id || null,
        bank_id: entryForm.bank_id || null,
        client_id: null, professional_id: null,
        notes: null,
        is_recurring: entryForm.is_recurring,
        recurring_day: null, recurring_count: null,
        recurring_frequency: entryForm.is_recurring ? entryForm.recurring_frequency : null,
        paid_date: null, appointment_id: null, installments: 1, paid_by: null, status: 'pending',
        overdue_tolerance_days: toleranceDays,
      } as any);
    }

    setEntryDialogOpen(false);
    resetEntryForm();
  };

  // Open detail view for a grouped entry
  const openDetail = (group: GroupedEntry) => {
    setDetailGroup(group);
    setDetailDialogOpen(true);
  };

  // Open edit entry dialog
  const openEditEntry = (entry: FinancialEntry, group: GroupedEntry) => {
    setEditingEntry(entry);
    setEditingGroup(group);
    setEditScope(null);
    setEditEntryForm({
      description: getBaseDescription(entry.description),
      category_id: entry.category_id || '',
      bank_id: entry.bank_id || '',
      is_recurring: entry.is_recurring,
      recurring_frequency: entry.recurring_frequency || 'monthly',
      amount: Number(entry.amount).toFixed(2),
      installment_amount: Number(entry.amount).toFixed(2),
      installments: String(entry.installments || 1),
      overdue_tolerance_days: String((entry as any).overdue_tolerance_days ?? 0),
    });
    setEditEntryDialogOpen(true);
  };

  const handleEditEntry = async () => {
    if (!editingEntry || !editScope) return;

    const buildPatch = (entry: FinancialEntry) => {
      const suffix = entry.description.match(/\s*\(\d+\/\d+\)\s*$/)?.[0] || '';
      return {
        id: entry.id,
        description: editEntryForm.description + suffix,
        category_id: editEntryForm.category_id || null,
        bank_id: editEntryForm.bank_id || null,
        is_recurring: editEntryForm.is_recurring,
        recurring_frequency: editEntryForm.is_recurring ? editEntryForm.recurring_frequency : null,
        amount: parseFloat(editEntryForm.amount) || 0,
        installments: parseInt(editEntryForm.installments) || 1,
        overdue_tolerance_days: parseInt(editEntryForm.overdue_tolerance_days) || 0,
      } as any;
    };

    if (editScope === 'current') {
      await updateEntry.mutateAsync(buildPatch(editingEntry));
      toast.success('Conta atualizada com sucesso');
    } else if (editingGroup) {
      const refDate = editingEntry.due_date;
      let targets = editingGroup.entries;
      if (editScope === 'all') {
        targets = editingGroup.entries;
      } else if (editScope === 'future') {
        // current month onwards (>= refDate)
        targets = editingGroup.entries.filter(e => e.due_date >= refDate);
      } else if (editScope === 'following') {
        // only months after current (> refDate)
        targets = editingGroup.entries.filter(e => e.due_date > refDate);
      }
      if (targets.length === 0) {
        toast.error('Nenhuma conta encontrada para o escopo selecionado');
        return;
      }
      for (const entry of targets) {
        await updateEntry.mutateAsync(buildPatch(entry));
      }
      toast.success(`${targets.length} conta(s) atualizada(s)`);
    }

    setEditEntryDialogOpen(false);
    setEditingEntry(null);
    setEditingGroup(null);
    setEditScope(null);
  };


  // Group entries by category
  const expensesByCategory = expenseCats.map(cat => ({
    ...cat,
    entries: payables.filter(e => e.category_id === cat.id),
    groups: groupEntries(payables.filter(e => e.category_id === cat.id)),
    total: payables.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  const incomesByCategory = incomeCats.map(cat => ({
    ...cat,
    entries: receivables.filter(e => e.category_id === cat.id),
    groups: groupEntries(receivables.filter(e => e.category_id === cat.id)),
    total: receivables.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  const isIncome = entryDialogType === 'income';

  const getStatusBadge = (entry: FinancialEntry) => {
    if (entry.status === 'paid') {
      const isPartial = entry.notes?.includes('Pagamento parcial');
      if (isPartial) return <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">Parcial</Badge>;
      return <Badge className="bg-green-100 text-green-700 text-[10px]">Pago</Badge>;
    }
    const dueDate = parseISO(entry.due_date + 'T12:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    if (today > dueDate) return <Badge className="bg-red-100 text-red-700 text-[10px]">Atrasada</Badge>;
    return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
  };

  const renderCategoryEntries = (cat: any) => {
    if (cat.groups.length === 0) {
      return <p className="text-muted-foreground text-sm pl-4">Nenhum lançamento nesta categoria</p>;
    }
    return (
      <div className="space-y-1 pl-4">
        {cat.groups.map((group: GroupedEntry) => (
          <div
            key={group.baseDescription}
            className="flex items-center justify-between py-2 px-2 border-b last:border-0 rounded hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => openDetail(group)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm truncate">{group.baseDescription}</span>
              {group.isRecurring && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {group.entries.length}x
                </Badge>
              )}
              {group.paidCount > 0 && group.pendingCount > 0 && (
                <Badge className="bg-yellow-100 text-yellow-700 text-[10px] shrink-0">
                  {group.paidCount}/{group.entries.length} pagas
                </Badge>
              )}
              {group.paidCount === group.entries.length && (
                <Badge className="bg-green-100 text-green-700 text-[10px] shrink-0">Quitado</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm font-medium ${cat.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                R$ {group.totalAmount.toFixed(2)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditEntry(group.entries[0], group);
                }}
                title="Editar conta"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    );
  };

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
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
        {/* Dialog for creating entry */}
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
                <div>
                  <Label>Dias de tolerância (atraso)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.overdue_tolerance_days}
                    onChange={(e) => setEntryForm({ ...entryForm, overdue_tolerance_days: e.target.value })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Dias após o vencimento antes de marcar como "Atrasada"
                  </p>
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

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailDialogOpen(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Detalhes: {detailGroup?.baseDescription}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh]">
              {detailGroup && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold">R$ {detailGroup.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Pagas</p>
                      <p className="text-lg font-bold text-green-600">{detailGroup.paidCount}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                      <p className="text-lg font-bold text-orange-600">{detailGroup.pendingCount}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Entries list */}
                  <div className="space-y-2">
                    {detailGroup.entries.map((entry) => (
                      <div key={entry.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{entry.description}</span>
                          {getStatusBadge(entry)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>
                            <span className="block">Vencimento</span>
                            <span className="text-foreground font-medium">
                              {format(parseISO(entry.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            </span>
                          </div>
                          <div>
                            <span className="block">Valor</span>
                            <span className="text-foreground font-medium">
                              R$ {Number(entry.amount).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block">Forma de Pagamento</span>
                            <span className="text-foreground font-medium">
                              {entry.payment_method?.name || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="block">Conta Bancária</span>
                            <span className="text-foreground font-medium">
                              {entry.bank?.name || '-'}
                            </span>
                          </div>
                          {entry.paid_date && (
                            <div>
                              <span className="block">Data do Pagamento</span>
                              <span className="text-foreground font-medium">
                                {format(parseISO(entry.paid_date + 'T12:00:00'), 'dd/MM/yyyy')}
                              </span>
                            </div>
                          )}
                          {entry.original_amount && (
                            <div>
                              <span className="block">Valor Original</span>
                              <span className="text-foreground font-medium">
                                R$ {Number(entry.original_amount).toFixed(2)}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="block">Categoria</span>
                            <span className="text-foreground font-medium">
                              {entry.category?.name || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="block">Parcelas</span>
                            <span className="text-foreground font-medium">
                              {entry.installments || 1}x
                            </span>
                          </div>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Edit Entry Dialog */}
        <Dialog open={editEntryDialogOpen} onOpenChange={(open) => { setEditEntryDialogOpen(open); if (!open) setEditScope(null); }}>
          <DialogContent className="max-w-md max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Editar Conta</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              {!editScope ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Como deseja editar "<strong>{editEntryForm.description}</strong>"?
                  </p>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setEditScope('current')}
                  >
                    <Pencil className="h-4 w-4" />
                    Somente o mês atual
                  </Button>
                  {editingGroup && editingGroup.entries.length > 1 && (() => {
                    const refDate = editingEntry?.due_date || '';
                    const futureCount = editingGroup.entries.filter(e => e.due_date >= refDate).length;
                    const followingCount = editingGroup.entries.filter(e => e.due_date > refDate).length;
                    return (
                      <>
                        {followingCount > 0 && (
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => setEditScope('following')}
                          >
                            <Pencil className="h-4 w-4" />
                            Apenas meses seguintes ({followingCount})
                          </Button>
                        )}
                        {futureCount > 1 && (
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => setEditScope('future')}
                          >
                            <Pencil className="h-4 w-4" />
                            Mês atual + meses seguintes ({futureCount})
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                          onClick={() => setEditScope('all')}
                        >
                          <Pencil className="h-4 w-4" />
                          Todos os meses ({editingGroup.entries.length})
                        </Button>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    {editScope === 'current' && 'Editando somente o mês atual'}
                    {editScope === 'following' && `Editando ${editingGroup?.entries.filter(e => editingEntry && e.due_date > editingEntry.due_date).length || 0} mês(es) seguinte(s)`}
                    {editScope === 'future' && `Editando ${editingGroup?.entries.filter(e => editingEntry && e.due_date >= editingEntry.due_date).length || 0} conta(s) (mês atual + seguintes)`}
                    {editScope === 'all' && `Editando todas as ${editingGroup?.entries.length || 0} contas`}
                  </p>

                  <div>
                    <Label>Nome da Conta</Label>
                    <Input
                      value={editEntryForm.description}
                      onChange={(e) => setEditEntryForm({ ...editEntryForm, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={editEntryForm.category_id} onValueChange={(v) => setEditEntryForm({ ...editEntryForm, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {[...expenseCats, ...incomeCats].map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conta Bancária</Label>
                    <Select value={editEntryForm.bank_id} onValueChange={(v) => setEditEntryForm({ ...editEntryForm, bank_id: v })}>
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
                      checked={editEntryForm.is_recurring}
                      onCheckedChange={(checked) => setEditEntryForm({ ...editEntryForm, is_recurring: checked })}
                    />
                    <Label>Conta recorrente</Label>
                  </div>
                  {editEntryForm.is_recurring && (
                    <div>
                      <Label>Frequência</Label>
                      <Select value={editEntryForm.recurring_frequency} onValueChange={(v) => setEditEntryForm({ ...editEntryForm, recurring_frequency: v })}>
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
                      <Label>Valor</Label>
                      <CurrencyInput
                        value={editEntryForm.amount}
                        onValueChange={(value) => setEditEntryForm({ ...editEntryForm, amount: String(value) })}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label>Parcelas</Label>
                      <Input
                        type="number"
                        min="1"
                        value={editEntryForm.installments}
                        onChange={(e) => setEditEntryForm({ ...editEntryForm, installments: e.target.value })}
                      />
                    </div>
                  </div>
                  {parseInt(editEntryForm.installments) > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Valor por parcela: R$ {(parseFloat(editEntryForm.amount || '0') / parseInt(editEntryForm.installments || '1')).toFixed(2)}
                    </p>
                  )}
                  <div>
                    <Label>Dias de tolerância (atraso)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editEntryForm.overdue_tolerance_days}
                      onChange={(e) => setEditEntryForm({ ...editEntryForm, overdue_tolerance_days: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Dias após o vencimento antes de marcar como "Atrasada"
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setEditScope(null)}>Voltar</Button>
                    <Button onClick={handleEditEntry}>
                      <Check className="h-4 w-4 mr-2" />
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
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
                          <span className="text-muted-foreground text-sm">({cat.groups.length})</span>
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
                      {renderCategoryEntries(cat)}
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
                          <span className="text-muted-foreground text-sm">({cat.groups.length})</span>
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
                      {renderCategoryEntries(cat)}
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
