import { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpCircle, ArrowDownCircle, Trash2, Filter, Pencil } from 'lucide-react';
import { useFinancialEntries, FinancialEntry } from '@/hooks/useFinancialEntries';
import { useBanks } from '@/hooks/useBanks';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ExtratoFinanceiro() {
  const { entries, deleteEntry, updateEntry, refetch } = useFinancialEntries();
  const { banks } = useBanks();
  const { categories } = useFinancialCategories();
  const { paymentMethods } = usePaymentMethods();
  const [dateFilterType, setDateFilterType] = useState<'all' | 'today' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'receivable' | 'payable'>('payable');
  
  // Edit state
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editPaymentMethodId, setEditPaymentMethodId] = useState('');
  
  // Delete state
  const [deletingEntry, setDeletingEntry] = useState<FinancialEntry | null>(null);
  const [deleteAllFollowing, setDeleteAllFollowing] = useState(false);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const today = new Date();
    
    return entries.filter((entry) => {
      // Type filter
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      
      // Date filter
      if (dateFilterType === 'today') {
        const dueDate = parseISO(entry.due_date);
        return isWithinInterval(dueDate, { start: startOfDay(today), end: endOfDay(today) });
      } else if (dateFilterType === 'month') {
        const dueDate = parseISO(entry.due_date);
        return isWithinInterval(dueDate, { start: startOfMonth(today), end: endOfMonth(today) });
      }
      return true;
    });
  }, [entries, dateFilterType, typeFilter]);

  // Calculate running balance per bank - sorted newest first
  const entriesWithBalance = useMemo(() => {
    const bankBalances: Record<string, number> = {};
    
    // First sort oldest to newest for balance calculation
    const sortedEntriesAsc = [...filteredEntries].sort((a, b) => 
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );

    // Calculate running balance
    const entriesWithCalcBalance = sortedEntriesAsc.map((entry) => {
      const bankId = entry.bank_id || 'sem_banco';
      if (!(bankId in bankBalances)) {
        bankBalances[bankId] = 0;
      }

      if (entry.status === 'paid') {
        if (entry.type === 'receivable') {
          bankBalances[bankId] += Number(entry.amount);
        } else {
          bankBalances[bankId] -= Number(entry.amount);
        }
      }

      return {
        ...entry,
        runningBalance: bankBalances[bankId],
      };
    });

    // Return sorted newest first (most recent updates at top)
    return entriesWithCalcBalance.sort((a, b) => 
      new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
    );
  }, [filteredEntries]);

  const openEditDialog = (entry: FinancialEntry) => {
    setEditingEntry(entry);
    setEditDescription(entry.description);
    setEditAmount(String(entry.amount));
    setEditDueDate(entry.due_date);
    setEditCategoryId(entry.category_id || '');
    setEditPaymentMethodId(entry.payment_method_id || '');
  };

  const handleEdit = () => {
    if (!editingEntry) return;
    
    updateEntry.mutate({
      id: editingEntry.id,
      description: editDescription,
      amount: Number(editAmount),
      due_date: editDueDate,
      category_id: editCategoryId && editCategoryId !== '_none' ? editCategoryId : null,
      payment_method_id: editPaymentMethodId && editPaymentMethodId !== '_none' ? editPaymentMethodId : null,
    });
    
    setEditingEntry(null);
  };

  const openDeleteDialog = (entry: FinancialEntry) => {
    setDeletingEntry(entry);
    setDeleteAllFollowing(false);
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;

    if (deleteAllFollowing) {
      // Delete all following entries with similar description pattern
      const baseDescription = deletingEntry.description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
      const entryDate = new Date(deletingEntry.due_date);
      
      const entriesToDelete = entries.filter(e => {
        const eBaseDescription = e.description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
        const eDate = new Date(e.due_date);
        return eBaseDescription === baseDescription && 
               e.type === deletingEntry.type &&
               eDate >= entryDate;
      });

      try {
        for (const entry of entriesToDelete) {
          await supabase.from('financial_entries').delete().eq('id', entry.id);
        }
        toast.success(`${entriesToDelete.length} lançamentos excluídos com sucesso!`);
        refetch();
      } catch (error: any) {
        toast.error('Erro ao excluir lançamentos: ' + error.message);
      }
    } else {
      deleteEntry.mutate(deletingEntry.id);
    }

    setDeletingEntry(null);
  };

  const expenseCategories = categories.filter(c => c.type === 'expense' && c.is_active);
  const incomeCategories = categories.filter(c => c.type === 'income' && c.is_active);
  const activePaymentMethods = paymentMethods.filter(pm => pm.is_active);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <CardTitle>Extrato</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={dateFilterType} onValueChange={(v: 'all' | 'today' | 'month') => setDateFilterType(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as datas</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v: 'all' | 'receivable' | 'payable') => setTypeFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="receivable">A Receber</SelectItem>
                <SelectItem value="payable">A Pagar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="min-w-[900px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Forma de Pagamento</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entriesWithBalance.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      {entry.type === 'receivable' ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      )}
                      {entry.description}
                    </TableCell>
                    <TableCell>{entry.category?.name || '-'}</TableCell>
                    <TableCell>{entry.payment_method?.name || '-'}</TableCell>
                    <TableCell>{entry.installments || 1}x</TableCell>
                    <TableCell className={entry.type === 'receivable' ? 'text-green-600' : 'text-red-600'}>
                      {entry.type === 'receivable' ? '+' : '-'} R$ {Number(entry.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className={entry.runningBalance >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      R$ {entry.runningBalance.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(entry)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(entry)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {entriesWithBalance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum lançamento encontrado para o período selecionado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>
              Altere os dados do lançamento financeiro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Valor (R$)</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Data de Vencimento</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoria</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {editingEntry?.type === 'payable' ? (
                    expenseCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))
                  ) : (
                    incomeCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-payment-method">Forma de Pagamento</Label>
              <Select value={editPaymentMethodId} onValueChange={setEditPaymentMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem forma de pagamento</SelectItem>
                  {activePaymentMethods.map(pm => (
                    <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancelar</Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingEntry} onOpenChange={(open) => !open && setDeletingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento?
              {deletingEntry && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="font-medium">{deletingEntry.description}</p>
                  <p className="text-sm">R$ {Number(deletingEntry.amount).toFixed(2)} - {format(parseISO(deletingEntry.due_date), 'dd/MM/yyyy')}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-all-following"
                checked={deleteAllFollowing}
                onCheckedChange={(checked) => setDeleteAllFollowing(checked === true)}
              />
              <Label htmlFor="delete-all-following" className="text-sm font-normal">
                Excluir este e todos os lançamentos seguintes com a mesma descrição
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
