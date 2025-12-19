import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  const { payables } = useFinancialEntries();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense',
    is_recurring: false,
    description: '',
    is_active: true,
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
      type: 'expense',
      is_recurring: false,
      description: '',
      is_active: true,
    });
    setEditingCat(null);
  };

  const openEdit = (cat: any) => {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      type: cat.type,
      is_recurring: cat.is_recurring,
      description: cat.description || '',
      is_active: cat.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (editingCat) {
      await updateCategory.mutateAsync({ id: editingCat.id, ...form });
    } else {
      await createCategory.mutateAsync(form);
    }
    setDialogOpen(false);
    resetForm();
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            </DialogHeader>
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
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v: 'income' | 'expense') => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa</SelectItem>
                    <SelectItem value="income">Receita</SelectItem>
                  </SelectContent>
                </Select>
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
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
