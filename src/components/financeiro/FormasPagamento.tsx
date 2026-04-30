import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Plus, Pencil, Trash2, CreditCard, Landmark, Banknote, FileText, Bell, AlertCircle, Check } from 'lucide-react';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { useCardBrands, type CardBrand } from '@/hooks/useCardBrands';
import { useAllBoletoInstallments } from '@/hooks/useBoletoInstallments';
import { ManageBanksDialog } from '@/components/caixa/ManageBanksDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const DEFAULT_PAYMENT_METHODS = [
  'Boleto Bancário',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'PIX',
  'Cheque',
  'Crédito ao Cliente',
  'Transferência Bancária',
  'Outros',
];

export function FormasPagamento() {
  const { paymentMethods, isLoading, createPaymentMethod, updatePaymentMethod, deletePaymentMethod } = usePaymentMethods();
  const { banks, activeBanks, createBank, updateBank, deleteBank } = useBanks();
  const { cardBrands, createCardBrand, updateCardBrand, deleteCardBrand, saveBrandFees } = useCardBrands();
  const { installments: allBoletoInstallments, isLoading: loadingBoletos, markAsPaid } = useAllBoletoInstallments();
  const queryClient = useQueryClient();

  const [defaultsInitialized, setDefaultsInitialized] = useState(false);

  // Payment Method Dialog
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [editingPm, setEditingPm] = useState<any>(null);
  const [pmForm, setPmForm] = useState({
    name: '',
    description: '',
    is_active: true,
    max_installments: 1,
  });

  // Card Brand Dialog
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<CardBrand | null>(null);
  const [brandForm, setBrandForm] = useState({
    name: '',
    type: 'credit' as 'credit' | 'debit' | 'both',
    is_active: true,
    fee_behavior: 'deduct_from_provider' as 'add_to_client' | 'deduct_from_provider',
  });
  const [brandFees, setBrandFees] = useState<{ installment_number: number; fee_percentage: number }[]>([
    { installment_number: 1, fee_percentage: 0 },
  ]);

  // Boleto tab filter
  const [boletoFilter, setBoletoFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('pending');

  useEffect(() => {
    if (!isLoading && !defaultsInitialized && paymentMethods.length === 0) {
      setDefaultsInitialized(true);
      DEFAULT_PAYMENT_METHODS.forEach(name => {
        createPaymentMethod.mutate({
          name,
          is_active: true,
          description: null,
          max_installments: name.includes('Crédito') || name.includes('Boleto') ? 12 : 1,
        });
      });
    }
  }, [isLoading, paymentMethods.length, defaultsInitialized]);

  const resetPmForm = () => {
    setPmForm({ name: '', description: '', is_active: true, max_installments: 1 });
    setEditingPm(null);
  };

  const openPmEdit = (pm: any) => {
    setEditingPm(pm);
    setPmForm({
      name: pm.name,
      description: pm.description || '',
      is_active: pm.is_active,
      max_installments: pm.max_installments || 1,
    });
    setPmDialogOpen(true);
  };

  const handlePmSubmit = async () => {
    if (editingPm) {
      await updatePaymentMethod.mutateAsync({ id: editingPm.id, ...pmForm });
    } else {
      await createPaymentMethod.mutateAsync(pmForm);
    }
    setPmDialogOpen(false);
    resetPmForm();
  };

  // Card Brand handlers
  const resetBrandForm = () => {
    setBrandForm({ name: '', type: 'credit', is_active: true, fee_behavior: 'deduct_from_provider' });
    setBrandFees([{ installment_number: 1, fee_percentage: 0 }]);
    setEditingBrand(null);
  };

  const openBrandEdit = (brand: CardBrand) => {
    setEditingBrand(brand);
    setBrandForm({
      name: brand.name,
      type: brand.type as 'credit' | 'debit' | 'both',
      is_active: brand.is_active,
      fee_behavior: brand.fee_behavior as 'add_to_client' | 'deduct_from_provider',
    });
    setBrandFees(brand.fees?.map(f => ({ 
      installment_number: f.installment_number, 
      fee_percentage: f.fee_percentage 
    })) || [{ installment_number: 1, fee_percentage: 0 }]);
    setBrandDialogOpen(true);
  };

  const handleBrandSubmit = async () => {
    if (editingBrand) {
      await updateCardBrand.mutateAsync({ id: editingBrand.id, ...brandForm });
      await saveBrandFees.mutateAsync({ brandId: editingBrand.id, fees: brandFees });
    } else {
      const result = await createCardBrand.mutateAsync(brandForm);
      if (result && brandFees.length > 0) {
        await saveBrandFees.mutateAsync({ brandId: result.id, fees: brandFees });
      }
    }
    setBrandDialogOpen(false);
    resetBrandForm();
  };

  const addFeeRow = () => {
    const nextInstallment = brandFees.length + 1;
    setBrandFees([...brandFees, { installment_number: nextInstallment, fee_percentage: 0 }]);
  };

  const updateFee = (index: number, value: number) => {
    const newFees = [...brandFees];
    newFees[index].fee_percentage = value;
    setBrandFees(newFees);
  };

  const removeFeeRow = (index: number) => {
    if (brandFees.length > 1) {
      setBrandFees(brandFees.filter((_, i) => i !== index));
    }
  };

  // Boleto installments data
  const filteredBoletos = allBoletoInstallments.filter((b: any) => {
    if (boletoFilter === 'all') return true;
    if (boletoFilter === 'pending') return b.status === 'pending';
    if (boletoFilter === 'overdue') {
      if (b.status !== 'pending') return false;
      const dueDate = new Date(b.due_date + 'T12:00:00');
      return dueDate < new Date();
    }
    if (boletoFilter === 'paid') return b.status === 'paid';
    return true;
  });

  const boletoStats = {
    total: allBoletoInstallments.length,
    pending: allBoletoInstallments.filter((b: any) => b.status === 'pending').length,
    overdue: allBoletoInstallments.filter((b: any) => {
      if (b.status !== 'pending') return false;
      return new Date(b.due_date + 'T12:00:00') < new Date();
    }).length,
    paid: allBoletoInstallments.filter((b: any) => b.status === 'paid').length,
    totalPending: allBoletoInstallments
      .filter((b: any) => b.status === 'pending')
      .reduce((sum: number, b: any) => sum + Number(b.amount), 0),
    totalOverdue: allBoletoInstallments
      .filter((b: any) => b.status === 'pending' && new Date(b.due_date + 'T12:00:00') < new Date())
      .reduce((sum: number, b: any) => sum + Number(b.amount), 0),
  };

  const handleBoletoPayment = async (boleto: any) => {
    await markAsPaid.mutateAsync({ id: boleto.id });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['reminders'] });
    queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
    queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
  };

  const getBoletoBadge = (boleto: any) => {
    if (boleto.status === 'paid') return <Badge className="bg-green-100 text-green-700 text-[10px]">Pago</Badge>;
    if (boleto.status === 'cancelled') return <Badge variant="secondary" className="text-[10px]">Cancelado</Badge>;
    const dueDate = new Date(boleto.due_date + 'T12:00:00');
    if (dueDate < new Date()) return <Badge className="bg-red-100 text-red-700 text-[10px]">Atrasado</Badge>;
    return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formas de Pagamento</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="methods" className="space-y-4">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="methods">
              <Banknote className="h-4 w-4 mr-2" />
              Métodos
            </TabsTrigger>
            <TabsTrigger value="boleto">
              <FileText className="h-4 w-4 mr-2" />
              Boleto
              {boletoStats.overdue > 0 && (
                <Badge className="ml-1 bg-red-500 text-white text-[9px] px-1 py-0">{boletoStats.overdue}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="banks">
              <Landmark className="h-4 w-4 mr-2" />
              Bancos
            </TabsTrigger>
            <TabsTrigger value="cards">
              <CreditCard className="h-4 w-4 mr-2" />
              Cartões
            </TabsTrigger>
          </TabsList>

          {/* Payment Methods Tab */}
          <TabsContent value="methods" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={pmDialogOpen} onOpenChange={(open) => { setPmDialogOpen(open); if (!open) resetPmForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Forma
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{editingPm ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[70vh] pr-4">
                    <div className="space-y-4">
                      <div>
                        <Label>Nome</Label>
                        <Input
                          value={pmForm.name}
                          onChange={(e) => setPmForm({ ...pmForm, name: e.target.value })}
                          placeholder="Nome da forma de pagamento"
                        />
                      </div>
                      <div>
                        <Label>Descrição</Label>
                        <Input
                          value={pmForm.description}
                          onChange={(e) => setPmForm({ ...pmForm, description: e.target.value })}
                          placeholder="Descrição (opcional)"
                        />
                      </div>
                      <div>
                        <Label>Máximo de Parcelas</Label>
                        <Input
                          type="number"
                          min="1"
                          value={pmForm.max_installments}
                          onChange={(e) => setPmForm({ ...pmForm, max_installments: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
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
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods.map((pm) => (
                    <TableRow key={pm.id}>
                      <TableCell className="font-medium">{pm.name}</TableCell>
                      <TableCell>{pm.max_installments || 1}x</TableCell>
                      <TableCell>
                        <Badge variant={pm.is_active ? 'default' : 'secondary'}>
                          {pm.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openPmEdit(pm)}>
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
            </ScrollArea>
          </TabsContent>

          {/* Boleto Bancário Tab */}
          <TabsContent value="boleto" className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center cursor-pointer hover:bg-muted/50" onClick={() => setBoletoFilter('all')}>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{boletoStats.total}</p>
              </div>
              <div className="rounded-lg border p-3 text-center cursor-pointer hover:bg-muted/50" onClick={() => setBoletoFilter('pending')}>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-lg font-bold text-orange-600">{boletoStats.pending}</p>
                <p className="text-[10px] text-muted-foreground">R$ {boletoStats.totalPending.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-red-200 p-3 text-center cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => setBoletoFilter('overdue')}>
                <p className="text-xs text-red-600">Atrasados</p>
                <p className="text-lg font-bold text-red-600">{boletoStats.overdue}</p>
                <p className="text-[10px] text-red-500">R$ {boletoStats.totalOverdue.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center cursor-pointer hover:bg-muted/50" onClick={() => setBoletoFilter('paid')}>
                <p className="text-xs text-muted-foreground">Pagos</p>
                <p className="text-lg font-bold text-green-600">{boletoStats.paid}</p>
              </div>
            </div>

            {boletoStats.overdue > 0 && (
              <Alert className="border-red-500 bg-red-50 dark:bg-red-950/30">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700 dark:text-red-400 text-xs">
                  {boletoStats.overdue} boleto(s) em atraso totalizando R$ {boletoStats.totalOverdue.toFixed(2)}.
                  Verifique e dê baixa nos pagamentos confirmados.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {boletoFilter === 'all' ? 'Todos os boletos' :
                 boletoFilter === 'pending' ? 'Boletos pendentes' :
                 boletoFilter === 'overdue' ? 'Boletos atrasados' : 'Boletos pagos'}
                {' '}({filteredBoletos.length})
              </p>
            </div>

            <ScrollArea className="h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoletos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {loadingBoletos ? 'Carregando...' : 'Nenhum boleto encontrado'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBoletos.map((boleto: any) => (
                      <TableRow key={boleto.id}>
                        <TableCell className="text-sm">
                          {boleto.installment_number}/{boleto.total_installments}
                        </TableCell>
                        <TableCell className="text-sm">
                          {boleto.sale?.client?.name || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(boleto.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          R$ {Number(boleto.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>{getBoletoBadge(boleto)}</TableCell>
                        <TableCell className="text-right">
                          {boleto.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => handleBoletoPayment(boleto)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Dar Baixa
                            </Button>
                          )}
                          {boleto.status === 'paid' && boleto.paid_date && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(boleto.paid_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <Separator />

            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Configuração de Boleto Bancário
              </h4>
              <p className="text-xs text-muted-foreground">
                Ao vender com boleto bancário parcelado, o sistema automaticamente:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Cria parcelas com vencimentos a cada 30 dias</li>
                <li>Cria lembretes para verificar pagamento na data de cada vencimento</li>
                <li>Registra a venda como "Parcelamento no Boleto Bancário" no financeiro</li>
                <li>Mostra alerta de boletos atrasados nos agendamentos do cliente</li>
                <li>Sincroniza status de pagamento em tempo real entre agenda, caixa e financeiro</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Para configurar o número máximo de parcelas do boleto, edite a forma de pagamento "Boleto Bancário" na aba Métodos.
              </p>
            </div>
          </TabsContent>

          {/* Banks Tab */}
          <TabsContent value="banks" className="space-y-4">
            <div className="flex justify-end">
              <ManageBanksDialog />
            </div>

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Banco</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Agência</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banks.map((bank) => (
                    <TableRow key={bank.id}>
                      <TableCell className="font-medium">{bank.name}</TableCell>
                      <TableCell>{bank.bank_code || '-'}</TableCell>
                      <TableCell>{bank.agency || '-'}</TableCell>
                      <TableCell>{bank.account_number || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={bank.is_active ? 'default' : 'secondary'}>
                          {bank.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {banks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum banco cadastrado. Use o botão acima para adicionar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          {/* Card Brands Tab */}
          <TabsContent value="cards" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={brandDialogOpen} onOpenChange={(open) => { setBrandDialogOpen(open); if (!open) resetBrandForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Bandeira
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{editingBrand ? 'Editar Bandeira' : 'Nova Bandeira de Cartão'}</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[70vh] pr-4">
                    <div className="space-y-4">
                      <div>
                        <Label>Nome da Bandeira</Label>
                        <Input
                          value={brandForm.name}
                          onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                          placeholder="Ex: Visa, Mastercard, Elo..."
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select value={brandForm.type} onValueChange={(v: 'credit' | 'debit' | 'both') => setBrandForm({ ...brandForm, type: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="credit">Crédito</SelectItem>
                            <SelectItem value="debit">Débito</SelectItem>
                            <SelectItem value="both">Ambos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quem paga a taxa?</Label>
                        <Select 
                          value={brandForm.fee_behavior} 
                          onValueChange={(v: 'add_to_client' | 'deduct_from_provider') => setBrandForm({ ...brandForm, fee_behavior: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="deduct_from_provider">Dono da Agenda (desconta do valor)</SelectItem>
                            <SelectItem value="add_to_client">Cliente (adiciona ao valor)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <Label>Taxas por Parcela</Label>
                          <Button variant="outline" size="sm" onClick={addFeeRow}>
                            <Plus className="h-3 w-3 mr-1" />
                            Parcela
                          </Button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {brandFees.map((fee, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="w-20 text-sm">{fee.installment_number}x:</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={fee.fee_percentage}
                                onChange={(e) => updateFee(index, parseFloat(e.target.value) || 0)}
                                className="flex-1"
                              />
                              <span className="text-sm">%</span>
                              {brandFees.length > 1 && (
                                <Button variant="ghost" size="icon" onClick={() => removeFeeRow(index)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={brandForm.is_active}
                          onCheckedChange={(checked) => setBrandForm({ ...brandForm, is_active: checked })}
                        />
                        <Label>Ativo</Label>
                      </div>
                      <Button onClick={handleBrandSubmit} className="w-full">
                        {editingBrand ? 'Salvar' : 'Criar Bandeira'}
                      </Button>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bandeira</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Quem paga taxa</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardBrands.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell className="font-medium">{brand.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {brand.type === 'credit' ? 'Crédito' : brand.type === 'debit' ? 'Débito' : 'Ambos'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {brand.fee_behavior === 'add_to_client' ? 'Cliente' : 'Dono'}
                      </TableCell>
                      <TableCell>
                        {brand.fees?.length || 0} configuradas
                      </TableCell>
                      <TableCell>
                        <Badge variant={brand.is_active ? 'default' : 'secondary'}>
                          {brand.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openBrandEdit(brand)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteCardBrand.mutate(brand.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cardBrands.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma bandeira cadastrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
