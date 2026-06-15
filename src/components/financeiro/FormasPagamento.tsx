import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, CreditCard, Landmark, Banknote, FileText, Bell, AlertCircle, Check, RefreshCw, Eye, History, LayoutList, Clock, AlertTriangle, CheckCircle2, Info, Ban } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { useCardBrands, type CardBrand } from '@/hooks/useCardBrands';
import { useAllBoletoInstallments } from '@/hooks/useBoletoInstallments';
import { ManageBanksDialog } from '@/components/caixa/ManageBanksDialog';
import { BoletoDetailModal } from './BoletoDetailModal';
import { BoletoAuditLogDialog } from './BoletoAuditLogDialog';
import { CreateBoletoParceladoDialog } from './CreateBoletoParceladoDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const DEFAULT_PAYMENT_METHODS = [
  'Boleto Bancário', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro',
  'PIX', 'Cheque', 'Crédito ao Cliente', 'Transferência Bancária', 'Outros',
];

export function FormasPagamento() {
  const { paymentMethods, isLoading, createPaymentMethod, updatePaymentMethod, deletePaymentMethod } = usePaymentMethods();
  const { banks, activeBanks, createBank, updateBank, deleteBank } = useBanks();
  const { cardBrands, createCardBrand, updateCardBrand, deleteCardBrand, saveBrandFees } = useCardBrands();
  const {
    installments: allBoletoInstallments, isLoading: loadingBoletos,
    markAsPaid, batchMarkAsPaid, updateInstallment, cancelInstallment, deleteInstallment, triggerSync,
  } = useAllBoletoInstallments();
  const queryClient = useQueryClient();

  const [defaultsInitialized, setDefaultsInitialized] = useState(false);
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [editingPm, setEditingPm] = useState<any>(null);
  const [pmForm, setPmForm] = useState({ name: '', description: '', is_active: true, max_installments: 1 });
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<CardBrand | null>(null);
  const [brandForm, setBrandForm] = useState({
    name: '', type: 'credit' as 'credit' | 'debit' | 'both',
    is_active: true, fee_behavior: 'deduct_from_provider' as 'add_to_client' | 'deduct_from_provider',
    split_fee: false,
  });
  const [brandFees, setBrandFees] = useState<{ installment_number: number; fee_percentage: number }[]>([
    { installment_number: 1, fee_percentage: 0 },
  ]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [boletoFilter, setBoletoFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [selectedBoletoIds, setSelectedBoletoIds] = useState<string[]>([]);
  const [detailClientKey, setDetailClientKey] = useState<string | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [createBoletoOpen, setCreateBoletoOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');

  useEffect(() => {
    if (!isLoading && !defaultsInitialized && paymentMethods.length === 0) {
      setDefaultsInitialized(true);
      DEFAULT_PAYMENT_METHODS.forEach(name => {
        createPaymentMethod.mutate({
          name, is_active: true, description: null,
          max_installments: name.includes('Crédito') || name.includes('Boleto') ? 12 : 1,
        });
      });
    }
  }, [isLoading, paymentMethods.length, defaultsInitialized]);

  // PM handlers
  const resetPmForm = () => { setPmForm({ name: '', description: '', is_active: true, max_installments: 1 }); setEditingPm(null); };
  const openPmEdit = (pm: any) => {
    setEditingPm(pm);
    setPmForm({ name: pm.name, description: pm.description || '', is_active: pm.is_active, max_installments: pm.max_installments || 1 });
    setPmDialogOpen(true);
  };
  const handlePmSubmit = async () => {
    if (editingPm) await updatePaymentMethod.mutateAsync({ id: editingPm.id, ...pmForm });
    else await createPaymentMethod.mutateAsync(pmForm);
    setPmDialogOpen(false); resetPmForm();
  };

  // Brand handlers
  const resetBrandForm = () => {
    setBrandForm({ name: '', type: 'credit', is_active: true, fee_behavior: 'deduct_from_provider', split_fee: false });
    setBrandFees([{ installment_number: 1, fee_percentage: 0 }]); setEditingBrand(null);
  };
  const openBrandEdit = (brand: CardBrand) => {
    setEditingBrand(brand);
    setBrandForm({ name: brand.name, type: brand.type as any, is_active: brand.is_active, fee_behavior: brand.fee_behavior as any, split_fee: (brand as any).split_fee || false });
    setBrandFees(brand.fees?.map(f => ({ installment_number: f.installment_number, fee_percentage: f.fee_percentage })) || [{ installment_number: 1, fee_percentage: 0 }]);
    setBrandDialogOpen(true);
  };
  const handleBrandSubmit = async () => {
    if (editingBrand) {
      await updateCardBrand.mutateAsync({ id: editingBrand.id, ...brandForm });
      await saveBrandFees.mutateAsync({ brandId: editingBrand.id, fees: brandFees });
    } else {
      const result = await createCardBrand.mutateAsync(brandForm);
      if (result && brandFees.length > 0) await saveBrandFees.mutateAsync({ brandId: result.id, fees: brandFees });
    }
    setBrandDialogOpen(false); resetBrandForm();
  };
  const addFeeRow = () => setBrandFees([...brandFees, { installment_number: brandFees.length + 1, fee_percentage: 0 }]);
  const updateFee = (i: number, v: number) => { const f = [...brandFees]; f[i].fee_percentage = v; setBrandFees(f); };
  const removeFeeRow = (i: number) => { if (brandFees.length > 1) setBrandFees(brandFees.filter((_, idx) => idx !== i)); };

  // Boleto data
  const filteredBoletos = allBoletoInstallments.filter((b: any) => {
    if (boletoFilter === 'all') return true;
    if (boletoFilter === 'pending') return b.status === 'pending';
    if (boletoFilter === 'overdue') {
      return (b.status === 'overdue') || (b.status === 'pending' && new Date(b.due_date + 'T12:00:00') < new Date());
    }
    if (boletoFilter === 'paid') return b.status === 'paid';
    return true;
  });

  const boletoStats = useMemo(() => {
    const all = allBoletoInstallments as any[];
    const pending = all.filter(b => b.status === 'pending' || b.status === 'overdue');
    const overdue = all.filter(b => b.status === 'overdue' || (b.status === 'pending' && new Date(b.due_date + 'T12:00:00') < new Date()));
    const paid = all.filter(b => b.status === 'paid');
    return {
      total: all.length,
      pending: pending.length,
      overdue: overdue.length,
      paid: paid.length,
      totalPending: pending.reduce((s, b) => s + Number(b.amount), 0),
      totalOverdue: overdue.reduce((s, b) => s + Number(b.amount), 0),
    };
  }, [allBoletoInstallments]);

  const selectedTotal = selectedBoletoIds.reduce((s, id) => {
    const b = allBoletoInstallments.find((x: any) => x.id === id);
    return s + (b ? Number((b as any).amount) : 0);
  }, 0);

  const pendingFilteredIds = filteredBoletos.filter((b: any) => b.status === 'pending' || b.status === 'overdue').map((b: any) => b.id);

  const toggleBoletoSelect = (id: string) => {
    setSelectedBoletoIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedBoletoIds.length === pendingFilteredIds.length) setSelectedBoletoIds([]);
    else setSelectedBoletoIds(pendingFilteredIds);
  };

  const handleBatchPay = async () => {
    if (selectedBoletoIds.length === 0) return;
    setBatchPaying(true);
    try {
      await batchMarkAsPaid.mutateAsync({ ids: selectedBoletoIds });
      setSelectedBoletoIds([]);
    } finally { setBatchPaying(false); }
  };

  const handleBulkDeleteAllBoletos = async () => {
    if (bulkDeleteConfirm !== 'EXCLUIR TODOS') {
      toast.error('Digite "EXCLUIR TODOS" para confirmar');
      return;
    }
    setBulkDeleting(true);
    try {
      const saleIds = Array.from(new Set((allBoletoInstallments as any[]).map(b => b.sale_id).filter(Boolean)));

      // 1) Apaga todas as parcelas (RLS limita ao usuário atual)
      const { error: delInstError } = await supabase
        .from('boleto_installments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delInstError) throw delInstError;

      // 2) Apaga as vendas (single_sales) que originaram os boletos e registros vinculados
      if (saleIds.length > 0) {
        const sb: any = supabase;
        await sb.from('cash_transactions').delete().eq('reference_type', 'single_sale').in('reference_id', saleIds);
        await sb.from('client_services').delete().in('sale_id', saleIds);
        await sb.from('single_sales').delete().in('id', saleIds);
      }

      // 3) Invalida todos os caches relevantes (financeiro, caixa, agenda)
      queryClient.invalidateQueries();
      toast.success('Todos os boletos foram excluídos.');
      setBulkDeleteOpen(false);
      setBulkDeleteConfirm('');
      setSelectedBoletoIds([]);
    } catch (err: any) {
      console.error('Erro ao excluir todos os boletos:', err);
      toast.error('Erro ao excluir boletos: ' + (err.message || 'desconhecido'));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBoletoPayment = async (boleto: any) => {
    await markAsPaid.mutateAsync({ id: boleto.id });
  };

  const getBoletoBadge = (boleto: any) => {
    if (boleto.status === 'paid') return <Badge className="bg-green-100 text-green-700 text-[10px]">Pago</Badge>;
    if (boleto.status === 'cancelled') return <Badge variant="secondary" className="text-[10px]">Cancelado</Badge>;
    if (boleto.status === 'overdue' || (boleto.status === 'pending' && new Date(boleto.due_date + 'T12:00:00') < new Date())) {
      return <Badge className="bg-red-100 text-red-700 text-[10px]">Atrasado</Badge>;
    }
    return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
  };

  // Group boletos by client (unified per-client view)
  const clientGroups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      clientId: string | null;
      clientName: string;
      clientPhone: string | null;
      installments: any[];
    }>();
    for (const b of allBoletoInstallments as any[]) {
      const clientId = b.sale?.client?.id || null;
      const clientName = b.sale?.client?.name || 'Sem cliente';
      const key = clientId || `name:${clientName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          clientId,
          clientName,
          clientPhone: b.sale?.client?.phone || null,
          installments: [],
        });
      }
      map.get(key)!.installments.push(b);
    }
    return Array.from(map.values());
  }, [allBoletoInstallments]);

  // Filter groups: a group matches if it contains at least one installment matching filter
  const filteredClientGroups = useMemo(() => {
    return clientGroups
      .map(g => ({
        ...g,
        filteredInstallments: g.installments.filter((b: any) => {
          if (boletoFilter === 'all') return true;
          if (boletoFilter === 'pending') return b.status === 'pending';
          if (boletoFilter === 'overdue') return b.status === 'overdue' || (b.status === 'pending' && new Date(b.due_date + 'T12:00:00') < new Date());
          if (boletoFilter === 'paid') return b.status === 'paid';
          return true;
        }),
      }))
      .filter(g => g.filteredInstallments.length > 0);
  }, [clientGroups, boletoFilter]);

  // Detail modal data — all installments for the selected client
  const detailGroup = detailClientKey ? clientGroups.find(g => g.key === detailClientKey) : null;
  const detailInstallments = detailGroup?.installments || [];
  const detailSale = detailInstallments.length > 0 ? (detailInstallments[0] as any).sale : null;

  // Deep-link: when redirected from the appointment detail dialog, auto-open the
  // boleto modal for the requested client and switch the filter to "pending".
  useEffect(() => {
    if (loadingBoletos) return;
    let pendingClientId: string | null = null;
    try {
      pendingClientId = sessionStorage.getItem('openBoletoClientId');
    } catch {}
    if (!pendingClientId) return;
    const match = clientGroups.find(g => g.clientId === pendingClientId);
    if (match) {
      setBoletoFilter('pending');
      setDetailClientKey(match.key);
      try { sessionStorage.removeItem('openBoletoClientId'); } catch {}
    }
  }, [clientGroups, loadingBoletos]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" />Formas de Pagamento</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="methods" className="space-y-4">
          <TabsList className="w-full grid grid-cols-4 h-auto">
            <TabsTrigger value="methods" className="text-[11px] sm:text-xs gap-1 px-1 h-9"><Banknote className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Métodos</span></TabsTrigger>
            <TabsTrigger value="boleto" className="text-[11px] sm:text-xs gap-1 px-1 h-9">
              <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Boleto</span>
              {boletoStats.overdue > 0 && <Badge className="ml-0.5 bg-red-500 text-white text-[9px] px-1 py-0">{boletoStats.overdue}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="banks" className="text-[11px] sm:text-xs gap-1 px-1 h-9"><Landmark className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Bancos</span></TabsTrigger>
            <TabsTrigger value="cards" className="text-[11px] sm:text-xs gap-1 px-1 h-9"><CreditCard className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Cartões</span></TabsTrigger>
          </TabsList>

          {/* Payment Methods Tab */}
          <TabsContent value="methods" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={pmDialogOpen} onOpenChange={(open) => { setPmDialogOpen(open); if (!open) resetPmForm(); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Nova Forma</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{editingPm ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[70vh] pr-4">
                    <div className="space-y-4">
                      <div><Label>Nome</Label><Input value={pmForm.name} onChange={e => setPmForm({ ...pmForm, name: e.target.value })} placeholder="Nome da forma de pagamento" /></div>
                      <div><Label>Descrição</Label><Input value={pmForm.description} onChange={e => setPmForm({ ...pmForm, description: e.target.value })} placeholder="Descrição (opcional)" /></div>
                      <div><Label>Máximo de Parcelas</Label><Input type="number" min="1" value={pmForm.max_installments} onChange={e => setPmForm({ ...pmForm, max_installments: parseInt(e.target.value) || 1 })} /></div>
                      <div className="flex items-center gap-2"><Switch checked={pmForm.is_active} onCheckedChange={checked => setPmForm({ ...pmForm, is_active: checked })} /><Label>Ativo</Label></div>
                      <Button onClick={handlePmSubmit} className="w-full">{editingPm ? 'Salvar' : 'Criar'}</Button>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
            <div className="max-h-[400px] overflow-y-auto overflow-x-visible">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Parcelas</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paymentMethods.map(pm => (
                    <TableRow key={pm.id}>
                      <TableCell className="font-medium">{pm.name}</TableCell>
                      <TableCell>{pm.max_installments || 1}x</TableCell>
                      <TableCell><Badge variant={pm.is_active ? 'default' : 'secondary'}>{pm.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openPmEdit(pm)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deletePaymentMethod.mutate(pm.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Boleto Tab */}
          <TabsContent value="boleto" className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button type="button" onClick={() => setBoletoFilter('all')} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition hover:bg-muted/50 border-l-2 border-l-blue-500", boletoFilter === 'all' && "bg-muted/50 ring-1 ring-blue-500/40")}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                  <LayoutList className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Total</p>
                  <p className="text-sm font-bold tabular-nums leading-tight text-blue-600">{boletoStats.total}</p>
                </div>
              </button>
              <button type="button" onClick={() => setBoletoFilter('pending')} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition hover:bg-muted/50 border-l-2 border-l-orange-500", boletoFilter === 'pending' && "bg-muted/50 ring-1 ring-orange-500/40")}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                  <Clock className="h-3.5 w-3.5 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Pendentes</p>
                  <p className="text-sm font-bold text-orange-600 tabular-nums leading-tight">{boletoStats.pending}</p>
                  <p className="text-[9px] text-muted-foreground tabular-nums leading-tight">R$ {boletoStats.totalPending.toFixed(2)}</p>
                </div>
              </button>
              <button type="button" onClick={() => setBoletoFilter('overdue')} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition hover:bg-red-50 dark:hover:bg-red-950/20 border-l-2 border-l-red-500", boletoFilter === 'overdue' && "bg-red-50 dark:bg-red-950/20 ring-1 ring-red-500/40")}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-red-600 leading-tight">Atrasados</p>
                  <p className="text-sm font-bold text-red-600 tabular-nums leading-tight">{boletoStats.overdue}</p>
                  <p className="text-[9px] text-red-500 tabular-nums leading-tight">R$ {boletoStats.totalOverdue.toFixed(2)}</p>
                </div>
              </button>
              <button type="button" onClick={() => setBoletoFilter('paid')} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition hover:bg-muted/50 border-l-2 border-l-emerald-500", boletoFilter === 'paid' && "bg-muted/50 ring-1 ring-emerald-500/40")}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Pagos</p>
                  <p className="text-sm font-bold text-emerald-600 tabular-nums leading-tight">{boletoStats.paid}</p>
                </div>
              </button>
            </div>

            {boletoStats.overdue > 0 && (
              <Alert className="border-red-500 bg-red-50 dark:bg-red-950/30">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700 dark:text-red-400 text-xs">
                  {boletoStats.overdue} boleto(s) em atraso totalizando R$ {boletoStats.totalOverdue.toFixed(2)}.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium">
                {boletoFilter === 'all' ? 'Todos' : boletoFilter === 'pending' ? 'Pendentes' : boletoFilter === 'overdue' ? 'Atrasados' : 'Pagos'}
                {' '}({filteredBoletos.length})
              </p>
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => setCreateBoletoOpen(true)}>
                  <Plus className="h-3 w-3" />
                  Criar Boleto
                </Button>
                <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => setShowAuditLog(true)}>
                  <History className="h-3 w-3" />
                  Histórico
                </Button>
                <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => triggerSync.mutate()} disabled={triggerSync.isPending}>
                  <RefreshCw className={`h-3 w-3 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
                  Sincronizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={(allBoletoInstallments as any[]).length === 0}
                  title="Excluir TODOS os boletos do sistema permanentemente"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir Todos
                </Button>
              </div>
            </div>

            {/* Info: cancelar vs excluir */}
            <Alert className="border-blue-500/40 bg-blue-50 dark:bg-blue-950/20 py-2">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              <AlertDescription className="text-[11px] text-blue-800 dark:text-blue-300 leading-snug">
                <strong>Cancelar boleto</strong> <Ban className="inline h-3 w-3 align-text-bottom" />: marca a parcela como <em>cancelada</em>, mantém o registro no histórico de auditoria e <strong>redistribui o valor</strong> entre as parcelas restantes (não apaga). Ideal para boletos que não serão mais cobrados, mas precisam ser rastreáveis.
                <br />
                <strong>Excluir parcela</strong> <Trash2 className="inline h-3 w-3 align-text-bottom" />: remove a parcela permanentemente do banco de dados. Use somente em casos de erro de cadastro.
                <br />
                <strong>Excluir Todos</strong>: apaga <strong>todos</strong> os boletos, vendas vinculadas, lançamentos de caixa e serviços vendidos — usado para limpar dados de teste. Ação irreversível.
              </AlertDescription>
            </Alert>

            {/* Batch bar */}
            {selectedBoletoIds.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-2 bg-primary/5">
                <span className="text-xs font-medium">
                  {selectedBoletoIds.length} parcela(s) selecionada(s) — R$ {selectedTotal.toFixed(2)}
                </span>
                <Button size="sm" className="gap-1" onClick={handleBatchPay} disabled={batchPaying}>
                  <Check className="h-3.5 w-3.5" />
                  {batchPaying ? 'Processando...' : 'Dar Baixa em Lote'}
                </Button>
              </div>
            )}

            <Separator />

            <div className="max-h-[350px] overflow-y-auto overflow-x-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Cliente</TableHead>
                    <TableHead className="text-[11px] text-center hidden sm:table-cell">Boletos</TableHead>
                    <TableHead className="text-[11px] text-center">Pend.</TableHead>
                    <TableHead className="text-[11px] text-center hidden xs:table-cell">Atras.</TableHead>
                    <TableHead className="text-[11px] hidden sm:table-cell">Próx. Venc.</TableHead>
                    <TableHead className="text-[11px]">Total</TableHead>
                    <TableHead className="text-[11px] text-right sticky right-0 bg-background">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                        {loadingBoletos ? 'Carregando...' : 'Nenhum boleto encontrado'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClientGroups.map((group) => {
                      const all = group.installments;
                      const pending = all.filter((b: any) => b.status === 'pending' || b.status === 'overdue');
                      const overdue = all.filter((b: any) =>
                        b.status === 'overdue' || (b.status === 'pending' && new Date(b.due_date + 'T12:00:00') < new Date())
                      );
                      const totalPending = pending.reduce((s: number, b: any) => s + Number(b.amount), 0);
                      const nextDue = pending
                        .map((b: any) => b.due_date)
                        .sort()[0];
                      return (
                        <TableRow key={group.key}>
                          <TableCell className="text-xs font-medium py-2">
                            <div className="truncate max-w-[140px]">{group.clientName}</div>
                            {group.clientPhone && <div className="text-[10px] text-muted-foreground">{group.clientPhone}</div>}
                          </TableCell>
                          <TableCell className="text-xs text-center hidden sm:table-cell tabular-nums">{all.length}</TableCell>
                          <TableCell className="text-xs text-center text-orange-600 font-medium tabular-nums">{pending.length}</TableCell>
                          <TableCell className="text-xs text-center hidden xs:table-cell tabular-nums">
                            {overdue.length > 0 ? <span className="text-red-600 font-semibold">{overdue.length}</span> : '-'}
                          </TableCell>
                          <TableCell className="text-xs hidden sm:table-cell tabular-nums">
                            {nextDue ? format(new Date(nextDue + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-orange-700 tabular-nums whitespace-nowrap">
                            R$ {totalPending.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right sticky right-0 bg-background">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-[11px] px-2"
                              onClick={() => setDetailClientKey(group.key)}
                            >
                              <Eye className="h-3 w-3" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator />

            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><Bell className="h-4 w-4" />Configuração de Boleto Bancário</h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Sincronização automática de status (pendente → atrasado) via job agendado</li>
                <li>Baixa parcial: selecione parcelas específicas para pagar</li>
                <li>Edição de valor e vencimento antes da baixa no modal de detalhes</li>
                <li>Sincroniza status em tempo real entre agenda, caixa e financeiro</li>
              </ul>
            </div>
          </TabsContent>

          {/* Banks Tab */}
          <TabsContent value="banks" className="space-y-4">
            <div className="flex justify-end"><ManageBanksDialog /></div>
            <div className="max-h-[400px] overflow-y-auto overflow-x-visible">
              <Table>
                <TableHeader><TableRow><TableHead>Banco</TableHead><TableHead>Código</TableHead><TableHead>Agência</TableHead><TableHead>Conta</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {banks.map(bank => (
                    <TableRow key={bank.id}>
                      <TableCell className="font-medium">{bank.name}</TableCell>
                      <TableCell>{bank.bank_code || '-'}</TableCell>
                      <TableCell>{bank.agency || '-'}</TableCell>
                      <TableCell>{bank.account_number || '-'}</TableCell>
                      <TableCell><Badge variant={bank.is_active ? 'default' : 'secondary'}>{bank.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {banks.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum banco cadastrado.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Card Brands Tab */}
          <TabsContent value="cards" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={brandDialogOpen} onOpenChange={(open) => { setBrandDialogOpen(open); if (!open) resetBrandForm(); }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Bandeira</Button></DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh]">
                  <DialogHeader><DialogTitle>{editingBrand ? 'Editar Bandeira' : 'Nova Bandeira de Cartão'}</DialogTitle></DialogHeader>
                  <ScrollArea className="max-h-[70vh] pr-4">
                    <div className="space-y-4">
                      <div><Label>Nome da Bandeira</Label><Input value={brandForm.name} onChange={e => setBrandForm({ ...brandForm, name: e.target.value })} placeholder="Ex: Visa, Mastercard, Elo..." /></div>
                      <div>
                        <Label>Tipo</Label>
                        <Select value={brandForm.type} onValueChange={(v: any) => setBrandForm({ ...brandForm, type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="credit">Crédito</SelectItem><SelectItem value="debit">Débito</SelectItem><SelectItem value="both">Ambos</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quem paga a taxa?</Label>
                        <Select value={brandForm.fee_behavior} onValueChange={(v: any) => setBrandForm({ ...brandForm, fee_behavior: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="deduct_from_provider">Dono da Agenda</SelectItem><SelectItem value="add_to_client">Cliente</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Dividir Taxa</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Switch checked={brandForm.split_fee} onCheckedChange={checked => setBrandForm({ ...brandForm, split_fee: checked })} />
                          <span className="text-xs text-muted-foreground">{brandForm.split_fee ? 'Taxa dividida entre as partes' : 'Taxa não dividida'}</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <Label>Taxas por Parcela</Label>
                          <Button variant="outline" size="sm" onClick={addFeeRow}><Plus className="h-3 w-3 mr-1" />Parcela</Button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {brandFees.map((fee, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="w-20 text-sm">{fee.installment_number}x:</span>
                              <Input type="number" step="0.01" min="0" value={fee.fee_percentage} onChange={e => updateFee(index, parseFloat(e.target.value) || 0)} className="flex-1" />
                              <span className="text-sm">%</span>
                              {brandFees.length > 1 && <Button variant="ghost" size="icon" onClick={() => removeFeeRow(index)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2"><Switch checked={brandForm.is_active} onCheckedChange={checked => setBrandForm({ ...brandForm, is_active: checked })} /><Label>Ativo</Label></div>
                      <Button onClick={handleBrandSubmit} className="w-full">{editingBrand ? 'Salvar' : 'Criar Bandeira'}</Button>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
            <div className="max-h-[400px] overflow-y-auto overflow-x-visible">
              <Table>
                <TableHeader><TableRow><TableHead className="text-[11px]">Bandeira</TableHead><TableHead className="text-[11px]">Tipo</TableHead><TableHead className="text-[11px] hidden sm:table-cell">Quem paga taxa</TableHead><TableHead className="text-[11px] hidden sm:table-cell">Parcelas</TableHead><TableHead className="text-[11px] hidden sm:table-cell">Status</TableHead><TableHead className="text-[11px] text-right sticky right-0 bg-background">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {cardBrands.map(brand => (
                    <TableRow key={brand.id}>
                      <TableCell className="font-medium text-xs">{brand.name}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{brand.type === 'credit' ? 'Crédito' : brand.type === 'debit' ? 'Débito' : 'Ambos'}</Badge></TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">{brand.fee_behavior === 'add_to_client' ? 'Cliente' : 'Dono'}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">{brand.fees?.length || 0} configuradas</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell"><Badge variant={brand.is_active ? 'default' : 'secondary'} className="text-[10px]">{brand.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                      <TableCell className="text-right sticky right-0 bg-background">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBrandEdit(brand)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCardBrand.mutate(brand.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cardBrands.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-xs">Nenhuma bandeira cadastrada</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Boleto Detail Modal */}
      <BoletoDetailModal
        open={!!detailClientKey}
        onOpenChange={open => { if (!open) setDetailClientKey(null); }}
        installments={detailInstallments}
        sale={detailSale}
        onMarkAsPaid={async (p) => { await markAsPaid.mutateAsync(p); }}
        onBatchPay={async (p) => { await batchMarkAsPaid.mutateAsync(p); }}
        onUpdate={async (p) => { await updateInstallment.mutateAsync(p); }}
        onCancel={async (id) => { await cancelInstallment.mutateAsync(id); }}
        onDelete={async (id) => { await deleteInstallment.mutateAsync(id); }}
      />
      <BoletoAuditLogDialog open={showAuditLog} onOpenChange={setShowAuditLog} />
      <CreateBoletoParceladoDialog open={createBoletoOpen} onOpenChange={setCreateBoletoOpen} />

      {/* Bulk Delete All Boletos */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) setBulkDeleteConfirm(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Excluir TODOS os boletos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Esta ação apaga <strong>permanentemente</strong>:</p>
                <ul className="list-disc ml-5 text-xs text-muted-foreground space-y-0.5">
                  <li>{(allBoletoInstallments as any[]).length} parcela(s) de boleto</li>
                  <li>Todas as vendas (single_sales) vinculadas aos boletos</li>
                  <li>Lançamentos de caixa e serviços vendidos correspondentes</li>
                </ul>
                <p className="text-xs text-destructive">A ação é irreversível e sincroniza automaticamente com Financeiro, Caixa e Agenda.</p>
                <div>
                  <Label className="text-xs">Para confirmar, digite <strong className="text-destructive">EXCLUIR TODOS</strong>:</Label>
                  <Input
                    value={bulkDeleteConfirm}
                    onChange={(e) => setBulkDeleteConfirm(e.target.value.toUpperCase())}
                    placeholder="EXCLUIR TODOS"
                    className="font-mono mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDeleteAllBoletos(); }}
              disabled={bulkDeleteConfirm !== 'EXCLUIR TODOS' || bulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Excluindo...' : 'Excluir Tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
