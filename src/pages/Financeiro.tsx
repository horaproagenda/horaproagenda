import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Landmark, 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  Tag,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBanks } from '@/hooks/useBanks';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useClients } from '@/hooks/useClients';
import { ManageBanksDialog } from '@/components/caixa/ManageBanksDialog';

export default function Financeiro() {
  const { banks } = useBanks();
  const { paymentMethods, activePaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod } = usePaymentMethods();
  const { categories, activeCategories, createCategory, updateCategory, deleteCategory } = useFinancialCategories();
  const { entries, receivables, payables, pendingReceivables, pendingPayables, totalReceivables, totalPayables, createEntry, updateEntry, deleteEntry } = useFinancialEntries();
  const { clients } = useClients();

  // Payment Method Dialog
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [editingPm, setEditingPm] = useState<any>(null);
  const [pmForm, setPmForm] = useState({ name: '', description: '', is_active: true, card_fee: 0, installment_fee: 0 });

  // Category Dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'expense' as 'income' | 'expense', is_recurring: false, description: '', is_active: true });

  // Entry Dialog
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [entryForm, setEntryForm] = useState({
    type: 'payable' as 'receivable' | 'payable',
    category_id: '',
    description: '',
    amount: '',
    due_date: new Date(),
    paid_date: null as Date | null,
    payment_method_id: '',
    bank_id: '',
    client_id: '',
    notes: '',
    is_recurring: false,
    recurring_day: '',
    recurring_count: '',
    recurring_frequency: 'monthly',
  });

  // Payment Method handlers
  const openPmDialog = (pm?: any) => {
    if (pm) {
      setEditingPm(pm);
      setPmForm({ name: pm.name, description: pm.description || '', is_active: pm.is_active, card_fee: pm.card_fee || 0, installment_fee: pm.installment_fee || 0 });
    } else {
      setEditingPm(null);
      setPmForm({ name: '', description: '', is_active: true, card_fee: 0, installment_fee: 0 });
    }
    setPmDialogOpen(true);
  };

  const handlePmSubmit = async () => {
    if (editingPm) {
      await updatePaymentMethod.mutateAsync({ id: editingPm.id, ...pmForm });
    } else {
      await createPaymentMethod.mutateAsync(pmForm);
    }
    setPmDialogOpen(false);
  };

  // Category handlers
  const openCatDialog = (cat?: any) => {
    if (cat) {
      setEditingCat(cat);
      setCatForm({ name: cat.name, type: cat.type, is_recurring: cat.is_recurring, description: cat.description || '', is_active: cat.is_active });
    } else {
      setEditingCat(null);
      setCatForm({ name: '', type: 'expense', is_recurring: false, description: '', is_active: true });
    }
    setCatDialogOpen(true);
  };

  const handleCatSubmit = async () => {
    if (editingCat) {
      await updateCategory.mutateAsync({ id: editingCat.id, ...catForm });
    } else {
      await createCategory.mutateAsync(catForm);
    }
    setCatDialogOpen(false);
  };

  // Entry handlers
  const openEntryDialog = (entry?: any, type?: 'receivable' | 'payable') => {
    if (entry) {
      setEditingEntry(entry);
      setEntryForm({
        type: entry.type,
        category_id: entry.category_id || '',
        description: entry.description,
        amount: entry.amount.toString(),
        due_date: parseISO(entry.due_date),
        paid_date: entry.paid_date ? parseISO(entry.paid_date) : null,
        payment_method_id: entry.payment_method_id || '',
        bank_id: entry.bank_id || '',
        client_id: entry.client_id || '',
        notes: entry.notes || '',
        is_recurring: entry.is_recurring,
        recurring_day: entry.recurring_day?.toString() || '',
        recurring_count: entry.recurring_count?.toString() || '',
        recurring_frequency: entry.recurring_frequency || 'monthly',
      });
    } else {
      setEditingEntry(null);
      setEntryForm({
        type: type || 'payable',
        category_id: '',
        description: '',
        amount: '',
        due_date: new Date(),
        paid_date: null,
        payment_method_id: '',
        bank_id: '',
        client_id: '',
        notes: '',
        is_recurring: false,
        recurring_day: '',
        recurring_count: '',
        recurring_frequency: 'monthly',
      });
    }
    setEntryDialogOpen(true);
  };

  const handleEntrySubmit = async () => {
    const entryData = {
      type: entryForm.type,
      category_id: entryForm.category_id || null,
      description: entryForm.description,
      amount: parseFloat(entryForm.amount) || 0,
      due_date: format(entryForm.due_date, 'yyyy-MM-dd'),
      status: 'pending' as const,
      payment_method_id: entryForm.payment_method_id || null,
      bank_id: entryForm.bank_id || null,
      client_id: entryForm.client_id || null,
      notes: entryForm.notes || null,
      is_recurring: entryForm.is_recurring,
      recurring_day: entryForm.recurring_day ? parseInt(entryForm.recurring_day) : null,
      recurring_count: entryForm.recurring_count ? parseInt(entryForm.recurring_count) : null,
      recurring_frequency: entryForm.recurring_frequency,
      paid_date: entryForm.paid_date ? format(entryForm.paid_date, 'yyyy-MM-dd') : null,
      appointment_id: null,
      installments: 1,
      paid_by: null,
    };

    if (editingEntry) {
      await updateEntry.mutateAsync({ id: editingEntry.id, ...entryData });
    } else {
      await createEntry.mutateAsync(entryData);
    }
    setEntryDialogOpen(false);
  };

  const markAsPaid = async (entry: any) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      status: 'paid',
      paid_date: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-500">Pago</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencido</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <AppLayout title="Financeiro" subtitle="Gestão financeira completa">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Receber</p>
                  <p className="text-2xl font-bold text-green-600">
                    R$ {totalReceivables.toFixed(2)}
                  </p>
                </div>
                <ArrowUpCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">A Pagar</p>
                  <p className="text-2xl font-bold text-red-600">
                    R$ {totalPayables.toFixed(2)}
                  </p>
                </div>
                <ArrowDownCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    totalReceivables - totalPayables >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    R$ {(totalReceivables - totalPayables).toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bancos</p>
                  <p className="text-2xl font-bold">
                    {banks.filter(b => b.is_active).length}
                  </p>
                </div>
                <Landmark className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="entries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="entries" className="gap-2">
              <FileText className="h-4 w-4" />
              Lançamentos
            </TabsTrigger>
            <TabsTrigger value="receivables" className="gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              A Receber
            </TabsTrigger>
            <TabsTrigger value="payables" className="gap-2">
              <ArrowDownCircle className="h-4 w-4" />
              A Pagar
            </TabsTrigger>
            <TabsTrigger value="banks" className="gap-2">
              <Landmark className="h-4 w-4" />
              Bancos
            </TabsTrigger>
            <TabsTrigger value="payment-methods" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Formas de Pagamento
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tag className="h-4 w-4" />
              Categorias
            </TabsTrigger>
          </TabsList>

          {/* Entries Tab */}
          <TabsContent value="entries" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Extrato</h3>
              <div className="flex gap-2">
                <Button onClick={() => openEntryDialog(undefined, 'payable')}>
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Nova Despesa
                </Button>
              </div>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, 20).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        {entry.type === 'receivable' ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">Receita</Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-600">Despesa</Badge>
                        )}
                      </TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>{entry.category?.name || '-'}</TableCell>
                      <TableCell className={entry.type === 'receivable' ? 'text-green-600' : 'text-red-600'}>
                        {entry.type === 'receivable' ? '+' : '-'} R$ {Number(entry.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {entry.status === 'pending' && (
                            <Button variant="ghost" size="icon" onClick={() => markAsPaid(entry)} title="Marcar como pago">
                              <RefreshCw className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEntryDialog(entry)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteEntry.mutate(entry.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Receivables Tab */}
          <TabsContent value="receivables" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Contas a Receber</h3>
              <Button onClick={() => openEntryDialog(undefined, 'receivable')}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conta a Receber
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReceivables.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{entry.client?.name || '-'}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-green-600 font-medium">R$ {Number(entry.amount).toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => markAsPaid(entry)}>
                            Receber
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEntryDialog(entry)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Payables Tab */}
          <TabsContent value="payables" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Contas a Pagar</h3>
              <Button onClick={() => openEntryDialog(undefined, 'payable')}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conta a Pagar
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayables.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>{entry.category?.name || '-'}</TableCell>
                      <TableCell className="text-red-600 font-medium">R$ {Number(entry.amount).toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => markAsPaid(entry)}>
                            Pagar
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEntryDialog(entry)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Banks Tab */}
          <TabsContent value="banks" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Bancos Cadastrados</h3>
              <ManageBanksDialog />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {banks.map((bank) => (
                <Card key={bank.id} className={cn(!bank.is_active && 'opacity-50')}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Landmark className="h-5 w-5" />
                      {bank.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {bank.bank_code && <p>Código: {bank.bank_code}</p>}
                      {bank.agency && <p>Agência: {bank.agency}</p>}
                      {bank.account_number && <p>Conta: {bank.account_number}</p>}
                      {bank.description && <p>{bank.description}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Payment Methods Tab */}
          <TabsContent value="payment-methods" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Formas de Pagamento</h3>
              <Button onClick={() => openPmDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Forma de Pagamento
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods.map((pm) => (
                    <TableRow key={pm.id}>
                      <TableCell className="font-medium">{pm.name}</TableCell>
                      <TableCell>{pm.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={pm.is_active ? 'default' : 'secondary'}>
                          {pm.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openPmDialog(pm)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deletePaymentMethod.mutate(pm.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Categorias Financeiras</h3>
              <Button onClick={() => openCatDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Categoria
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Recorrente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cat.type === 'income' ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}>
                          {cat.type === 'income' ? 'Receita' : 'Despesa'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cat.is_recurring && (
                          <Badge variant="secondary">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Mensal
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                          {cat.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openCatDialog(cat)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteCategory.mutate(cat.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payment Method Dialog */}
        <Dialog open={pmDialogOpen} onOpenChange={setPmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPm ? 'Editar' : 'Nova'} Forma de Pagamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={pmForm.name}
                  onChange={(e) => setPmForm({ ...pmForm, name: e.target.value })}
                  placeholder="Ex: PIX, Cartão de Crédito..."
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={pmForm.description}
                  onChange={(e) => setPmForm({ ...pmForm, description: e.target.value })}
                  placeholder="Descrição opcional"
                />
              </div>
              {(pmForm.name.toLowerCase().includes('crédito') || pmForm.name.toLowerCase().includes('débito') || pmForm.name.toLowerCase().includes('cartao') || pmForm.name.toLowerCase().includes('cartão')) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Taxa da Maquininha (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={pmForm.card_fee}
                      onChange={(e) => setPmForm({ ...pmForm, card_fee: parseFloat(e.target.value) || 0 })}
                      placeholder="Ex: 2.5"
                    />
                    <p className="text-xs text-muted-foreground">Taxa cobrada por transação</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa por Parcela (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={pmForm.installment_fee}
                      onChange={(e) => setPmForm({ ...pmForm, installment_fee: parseFloat(e.target.value) || 0 })}
                      placeholder="Ex: 1.5"
                    />
                    <p className="text-xs text-muted-foreground">Taxa adicional por parcela</p>
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={pmForm.is_active}
                  onCheckedChange={(checked) => setPmForm({ ...pmForm, is_active: checked })}
                />
                <Label>Ativo</Label>
              </div>
              <Button onClick={handlePmSubmit} className="w-full">
                {editingPm ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Category Dialog */}
        <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCat ? 'Editar' : 'Nova'} Categoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="Ex: Aluguel, Energia..."
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={catForm.type} onValueChange={(v: 'income' | 'expense') => setCatForm({ ...catForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa</SelectItem>
                    <SelectItem value="income">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={catForm.is_recurring}
                  onCheckedChange={(checked) => setCatForm({ ...catForm, is_recurring: checked })}
                />
                <Label>Conta Recorrente (mensal)</Label>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  placeholder="Descrição opcional"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={catForm.is_active}
                  onCheckedChange={(checked) => setCatForm({ ...catForm, is_active: checked })}
                />
                <Label>Ativo</Label>
              </div>
              <Button onClick={handleCatSubmit} className="w-full">
                {editingCat ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Entry Dialog */}
        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Editar' : 'Novo'} {entryForm.type === 'receivable' ? 'Conta a Receber' : 'Conta a Pagar'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={entryForm.type} onValueChange={(v: 'receivable' | 'payable') => setEntryForm({ ...entryForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receivable">A Receber</SelectItem>
                    <SelectItem value="payable">A Pagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input
                  value={entryForm.description}
                  onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                  placeholder="Descrição do lançamento"
                />
              </div>

              <div className="space-y-2">
                <Label>Valor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={entryForm.amount}
                  onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {format(entryForm.due_date, 'dd/MM/yyyy', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={entryForm.due_date}
                        onSelect={(date) => date && setEntryForm({ ...entryForm, due_date: date })}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Data de Pagamento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {entryForm.paid_date ? format(entryForm.paid_date, 'dd/MM/yyyy', { locale: ptBR }) : 'Não pago'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={entryForm.paid_date || undefined}
                        onSelect={(date) => setEntryForm({ ...entryForm, paid_date: date || null })}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={entryForm.category_id} onValueChange={(v) => setEntryForm({ ...entryForm, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories
                      .filter(c => c.type === (entryForm.type === 'receivable' ? 'income' : 'expense'))
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {entryForm.type === 'receivable' && (
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={entryForm.client_id} onValueChange={(v) => setEntryForm({ ...entryForm, client_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {clients.filter(c => c.is_active).map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={entryForm.payment_method_id} onValueChange={(v) => setEntryForm({ ...entryForm, payment_method_id: v })}>
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

              {entryForm.type === 'payable' && (
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Select value={entryForm.bank_id} onValueChange={(v) => setEntryForm({ ...entryForm, bank_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o banco" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.filter(b => b.is_active).map((bank) => (
                        <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Banco de onde o dinheiro foi retirado para pagar esta conta
                  </p>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  checked={entryForm.is_recurring}
                  onCheckedChange={(checked) => setEntryForm({ ...entryForm, is_recurring: checked })}
                />
                <Label>Lançamento Recorrente</Label>
              </div>

              {entryForm.is_recurring && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Dia do mês</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={entryForm.recurring_day}
                      onChange={(e) => setEntryForm({ ...entryForm, recurring_day: e.target.value })}
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Repetições</Label>
                    <Input
                      type="number"
                      min="1"
                      value={entryForm.recurring_count}
                      onChange={(e) => setEntryForm({ ...entryForm, recurring_count: e.target.value })}
                      placeholder="Ex: 12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequência</Label>
                    <Select value={entryForm.recurring_frequency} onValueChange={(v) => setEntryForm({ ...entryForm, recurring_frequency: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                  placeholder="Observações adicionais"
                />
              </div>

              <Button onClick={handleEntrySubmit} className="w-full">
                {editingEntry ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
