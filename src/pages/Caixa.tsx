import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShoppingCart, 
  Package, 
  User, 
  CreditCard, 
  Clock, 
  CalendarDays,
  CheckCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Download,
  AlertTriangle,
  Phone,
  Gift,
  Plus,
  Trash2,
  History,
  Percent,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { CashRegisterFilters } from '@/components/caixa/CashRegisterFilters';
import { CashRegisterStatus } from '@/components/caixa/CashRegisterStatus';
import { CashRegisterHistory } from '@/components/caixa/CashRegisterHistory';
import { CommissionsReport } from '@/components/caixa/CommissionsReport';
import { ManageBanksDialog } from '@/components/caixa/ManageBanksDialog';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência',
  installments: 'Parcelado',
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência Bancária' },
  { value: 'installments', label: 'Parcelado' },
];

export default function Caixa() {
  const { packages, refetch: refetchPackages } = useServicePackages();
  const { clients } = useClients();
  const { appointments, isLoading: isLoadingAppointments, updatePayment } = useAppointments();
  const { professionals } = useProfessionals();
  const { 
    currentOpenRegister, 
    closedRegisters, 
    isLoading: isLoadingCashRegisters,
    openCashRegister,
    closeCashRegister,
  } = useCashRegisters();
  const { hasRole } = useAuth();
  const canAddClientCredit = hasRole('admin');
  
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  
  // Report filters
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  // Payment dialog state for receivables
  const [paymentAppointment, setPaymentAppointment] = useState<typeof receivables[0] | null>(null);
  const [paymentEntries, setPaymentEntries] = useState<{ method: string; amount: string }[]>([
    { method: 'pix', amount: '' },
  ]);
  const [clientCreditAmount, setClientCreditAmount] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Filter packages that don't have a client assigned yet (available for sale)
  const availablePackages = packages.filter(pkg => !pkg.client_id && pkg.is_active);
  
  // Packages that have been sold (have a client)
  const soldPackages = packages.filter(pkg => pkg.client_id && pkg.is_active);

  const currentPackage = availablePackages.find(pkg => pkg.id === selectedPackage);

  // Get date range for filtering
  const getDateRange = () => {
    const today = new Date();
    switch (dateRange) {
      case 'today':
        return { start: startOfDay(today), end: endOfDay(today) };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'last7days':
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case 'last30days':
        return { start: startOfDay(subDays(today, 30)), end: endOfDay(today) };
      case 'thisMonth':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'custom':
        return {
          start: customStartDate ? startOfDay(customStartDate) : startOfMonth(today),
          end: customEndDate ? endOfDay(customEndDate) : endOfDay(today),
        };
      default:
        return { start: startOfDay(today), end: endOfDay(today) };
    }
  };

  // Filter paid appointments for the report
  const paidAppointments = useMemo(() => {
    const { start, end } = getDateRange();
    
    return appointments.filter(apt => {
      // Only paid appointments
      if (apt.payment_status !== 'paid' || !apt.amount_paid || apt.amount_paid <= 0) {
        return false;
      }
      
      // Date filter
      const aptDate = parseISO(apt.updated_at);
      if (!isWithinInterval(aptDate, { start, end })) {
        return false;
      }
      
      // Payment method filter
      if (paymentMethodFilter !== 'all') {
        const methods = apt.payment_methods || [];
        if (!methods.includes(paymentMethodFilter)) {
          return false;
        }
      }
      
      // Professional filter
      if (professionalFilter !== 'all') {
        const profId = apt.professional_id || apt.service?.professional_id;
        if (profId !== professionalFilter) {
          return false;
        }
      }

      // Client filter
      if (clientFilter !== 'all') {
        if (apt.client_id !== clientFilter) {
          return false;
        }
      }
      
      return true;
    });
  }, [appointments, dateRange, customStartDate, customEndDate, paymentMethodFilter, professionalFilter, clientFilter]);

  // Filter appointments with pending amounts (receivables)
  const receivables = useMemo(() => {
    const { start, end } = getDateRange();
    
    return appointments.filter(apt => {
      // Only appointments with pending or partial payment status
      if (apt.payment_status === 'paid') return false;
      
      const servicePrice = apt.service?.price || 0;
      const amountPaid = apt.amount_paid || 0;
      const remainingAmount = servicePrice - amountPaid;
      
      // Must have a remaining balance
      if (remainingAmount <= 0) return false;
      
      // Date filter - check appointment date
      const aptDate = parseISO(apt.start_time);
      if (!isWithinInterval(aptDate, { start, end })) {
        return false;
      }

      // Client filter
      if (clientFilter !== 'all') {
        if (apt.client_id !== clientFilter) {
          return false;
        }
      }
      
      return true;
    }).map(apt => ({
      ...apt,
      remainingAmount: (apt.service?.price || 0) - (apt.amount_paid || 0),
    }));
  }, [appointments, dateRange, customStartDate, customEndDate, clientFilter]);

  // Group receivables by client
  const receivablesByClient = useMemo(() => {
    const grouped: Record<string, {
      client: typeof receivables[0]['client'];
      appointments: typeof receivables;
      totalRemaining: number;
    }> = {};

    receivables.forEach(apt => {
      const clientId = apt.client_id;
      if (!grouped[clientId]) {
        grouped[clientId] = {
          client: apt.client,
          appointments: [],
          totalRemaining: 0,
        };
      }
      grouped[clientId].appointments.push(apt);
      grouped[clientId].totalRemaining += apt.remainingAmount;
    });

    return Object.values(grouped).sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [receivables]);

  const totalReceivables = useMemo(() => {
    return receivables.reduce((sum, apt) => sum + apt.remainingAmount, 0);
  }, [receivables]);

  // Calculate totals
  const totals = useMemo(() => {
    const total = paidAppointments.reduce((sum, apt) => sum + (apt.amount_paid || 0), 0);
    const count = paidAppointments.length;
    
    const byMethod: Record<string, number> = {};
    paidAppointments.forEach(apt => {
      (apt.payment_methods || []).forEach(method => {
        byMethod[method] = (byMethod[method] || 0) + (apt.amount_paid || 0) / (apt.payment_methods?.length || 1);
      });
    });
    
    return { total, count, byMethod };
  }, [paidAppointments]);

  const togglePaymentMethod = (method: string) => {
    if (selectedPaymentMethods.includes(method)) {
      setSelectedPaymentMethods(prev => prev.filter(m => m !== method));
    } else {
      setSelectedPaymentMethods(prev => [...prev, method]);
    }
  };

  const handleSale = async () => {
    if (!selectedPackage || !selectedClient || selectedPaymentMethods.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('service_packages')
        .update({
          client_id: selectedClient,
          payment_methods: selectedPaymentMethods,
          payment_method: selectedPaymentMethods[0],
        })
        .eq('id', selectedPackage);

      if (error) throw error;

      toast.success('Venda realizada com sucesso!');
      setShowSuccessDialog(true);
      setSelectedPackage(null);
      setSelectedClient('');
      setSelectedPaymentMethods([]);
      refetchPackages();
    } catch (error: any) {
      toast.error('Erro ao processar venda: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSale = () => {
    setSelectedPackage(null);
    setSelectedClient('');
    setSelectedPaymentMethods([]);
    setShowSuccessDialog(false);
  };

  const exportReport = () => {
    const { start, end } = getDateRange();
    const csvContent = [
      ['Data', 'Cliente', 'Serviço', 'Profissional', 'Forma de Pagamento', 'Valor'].join(';'),
      ...paidAppointments.map(apt => [
        format(parseISO(apt.updated_at), 'dd/MM/yyyy HH:mm'),
        apt.client?.name || '-',
        apt.service?.name || '-',
        apt.service?.professional?.name || '-',
        (apt.payment_methods || []).map(m => PAYMENT_LABELS[m] || m).join(', '),
        `R$ ${Number(apt.amount_paid).toFixed(2)}`,
      ].join(';')),
      ['', '', '', '', 'TOTAL:', `R$ ${totals.total.toFixed(2)}`].join(';'),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-caixa-${format(start, 'dd-MM-yyyy')}-a-${format(end, 'dd-MM-yyyy')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado com sucesso!');
  };

  const openPaymentDialog = (apt: typeof receivables[0]) => {
    setPaymentAppointment(apt);
    setPaymentEntries([{ method: 'pix', amount: apt.remainingAmount.toFixed(2) }]);
    setClientCreditAmount('');
  };

  const addPaymentEntry = () => {
    setPaymentEntries([...paymentEntries, { method: 'pix', amount: '' }]);
  };

  const removePaymentEntry = (index: number) => {
    setPaymentEntries(paymentEntries.filter((_, i) => i !== index));
  };

  const updatePaymentEntry = (index: number, field: 'method' | 'amount', value: string) => {
    const newEntries = [...paymentEntries];
    newEntries[index][field] = value;
    setPaymentEntries(newEntries);
  };

  const totalPaymentValue = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const clientCredit = parseFloat(clientCreditAmount) || 0;
  const totalWithCredit = totalPaymentValue + clientCredit;

  const handleRegisterPayment = async () => {
    if (!paymentAppointment) return;

    const hasPayments = totalPaymentValue > 0;
    const hasCredit = clientCredit > 0;

    if (!hasPayments && !hasCredit) {
      toast.error('Informe pelo menos um valor de pagamento ou crédito');
      return;
    }

    const paymentMethods = paymentEntries
      .filter(p => parseFloat(p.amount) > 0)
      .map(p => p.method);

    if (hasPayments && paymentMethods.length === 0) {
      toast.error('Selecione pelo menos uma forma de pagamento');
      return;
    }

    setIsProcessingPayment(true);
    try {
      const newAmountPaid = (paymentAppointment.amount_paid || 0) + totalWithCredit;
      const servicePrice = paymentAppointment.service?.price || 0;
      const newPaymentStatus = newAmountPaid >= servicePrice ? 'paid' : 'partial';
      const existingMethods = paymentAppointment.payment_methods || [];
      const allMethods = [...new Set([...existingMethods, ...paymentMethods])];

      await updatePayment.mutateAsync({
        id: paymentAppointment.id,
        payment: {
          payment_methods: allMethods,
          amount_paid: newAmountPaid,
          payment_status: newPaymentStatus,
          client_credit: clientCredit > 0 ? clientCredit : undefined,
          client_id: paymentAppointment.client_id,
        },
      });

      setPaymentAppointment(null);
      setPaymentEntries([{ method: 'pix', amount: '' }]);
      setClientCreditAmount('');
    } catch (error) {
      // Error is handled by the mutation
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <AppLayout title="Caixa" subtitle="Vendas e relatório financeiro">
      <div className="space-y-6">
        {/* Cash Register Status */}
        <CashRegisterStatus
          currentRegister={currentOpenRegister}
          totals={totals}
          totalReceivables={totalReceivables}
          onOpenCashRegister={(balance) => openCashRegister.mutate(balance)}
          onCloseCashRegister={(params) => closeCashRegister.mutate(params)}
          isLoading={isLoadingCashRegisters || openCashRegister.isPending || closeCashRegister.isPending}
        />

        {/* Management Buttons */}
        <div className="flex gap-2">
          <ManageBanksDialog />
        </div>

        <Tabs defaultValue="report" className="space-y-4">
          <TabsList>
            <TabsTrigger value="report" className="gap-2">
              <FileText className="h-4 w-4" />
              Relatório
            </TabsTrigger>
            <TabsTrigger value="receivables" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              A Receber
              {totalReceivables > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  R$ {totalReceivables.toFixed(0)}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Vendas
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="commissions" className="gap-2">
              <Percent className="h-4 w-4" />
              Comissões
            </TabsTrigger>
          </TabsList>

          {/* Report Tab */}
          <TabsContent value="report" className="space-y-4">
            {/* Compact Filters */}
            <CashRegisterFilters
              dateRange={dateRange}
              setDateRange={setDateRange}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              customEndDate={customEndDate}
              setCustomEndDate={setCustomEndDate}
              paymentMethodFilter={paymentMethodFilter}
              setPaymentMethodFilter={setPaymentMethodFilter}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              clientFilter={clientFilter}
              setClientFilter={setClientFilter}
              professionals={professionals}
              clients={clients}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Recebido</p>
                      <p className="text-xl font-bold text-primary">
                        R$ {totals.total.toFixed(2)}
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-primary/20" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Pagamentos</p>
                      <p className="text-xl font-bold">{totals.count}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-success/20" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Ticket Médio</p>
                      <p className="text-xl font-bold">
                        R$ {totals.count > 0 ? (totals.total / totals.count).toFixed(2) : '0.00'}
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-blue-500/20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">A Receber</p>
                      <p className="text-xl font-bold text-warning">
                        R$ {totalReceivables.toFixed(2)}
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-warning/20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payments by Method */}
            {Object.keys(totals.byMethod).length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg">
                <span className="text-sm text-muted-foreground">Por forma:</span>
                {Object.entries(totals.byMethod).map(([method, amount]) => (
                  <Badge key={method} variant="secondary">
                    {PAYMENT_LABELS[method] || method}: R$ {Number(amount).toFixed(2)}
                  </Badge>
                ))}
              </div>
            )}

            {/* Transactions Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transações
                </CardTitle>
                <Button variant="outline" size="sm" onClick={exportReport} disabled={paidAppointments.length === 0}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingAppointments ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                ) : paidAppointments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Nenhum pagamento no período</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead>Profissional</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paidAppointments.map(apt => (
                          <TableRow key={apt.id}>
                            <TableCell className="text-sm">
                              {format(parseISO(apt.updated_at), 'dd/MM HH:mm', { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              {apt.client?.name || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {apt.service?.name || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {apt.service?.professional?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(apt.payment_methods || []).map(method => (
                                  <Badge key={method} variant="secondary" className="text-xs">
                                    {PAYMENT_LABELS[method] || method}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium text-primary">
                              R$ {Number(apt.amount_paid).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={5} className="text-right">TOTAL:</TableCell>
                          <TableCell className="text-right text-primary">
                            R$ {totals.total.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Receivables Tab */}
          <TabsContent value="receivables" className="space-y-4">
            {/* Compact Filters */}
            <CashRegisterFilters
              dateRange={dateRange}
              setDateRange={setDateRange}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              customEndDate={customEndDate}
              setCustomEndDate={setCustomEndDate}
              paymentMethodFilter={paymentMethodFilter}
              setPaymentMethodFilter={setPaymentMethodFilter}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              clientFilter={clientFilter}
              setClientFilter={setClientFilter}
              professionals={professionals}
              clients={clients}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total a Receber</p>
                      <p className="text-xl font-bold text-warning">
                        R$ {totalReceivables.toFixed(2)}
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-warning/20" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Clientes Pendentes</p>
                      <p className="text-xl font-bold">{receivablesByClient.length}</p>
                    </div>
                    <User className="h-8 w-8 text-blue-500/20" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Agendamentos</p>
                      <p className="text-xl font-bold">{receivables.length}</p>
                    </div>
                    <CalendarDays className="h-8 w-8 text-orange-500/20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Receivables by Client */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Valores a Receber por Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingAppointments ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 rounded-lg" />
                    ))}
                  </div>
                ) : receivablesByClient.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-50" />
                    <p>Nenhum valor pendente</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="p-4 space-y-3">
                      {receivablesByClient.map(({ client, appointments: clientAppointments, totalRemaining }) => (
                        <Card key={client?.id} className="border-warning/30 bg-warning/5">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-warning/20 flex items-center justify-center">
                                  <User className="h-5 w-5 text-warning" />
                                </div>
                                <div>
                                  <h4 className="font-semibold">{client?.name || 'Cliente não identificado'}</h4>
                                  {client?.phone && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                      <Phone className="h-3 w-3" />
                                      {client.phone}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Total em aberto</p>
                                <p className="text-lg font-bold text-warning">R$ {totalRemaining.toFixed(2)}</p>
                              </div>
                            </div>

                            <Separator className="my-3" />

                            <div className="space-y-2">
                              {clientAppointments.map(apt => (
                                <div
                                  key={apt.id}
                                  className="flex items-center justify-between p-2 rounded bg-background/50"
                                >
                                  <div>
                                    <p className="text-sm font-medium">{apt.service?.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(parseISO(apt.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <p className="text-xs">
                                        <span className="text-muted-foreground">Pago: </span>
                                        <span className="text-success">R$ {(apt.amount_paid || 0).toFixed(2)}</span>
                                      </p>
                                      <p className="text-sm font-semibold text-warning">
                                        Pendente: R$ {apt.remainingAmount.toFixed(2)}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => openPaymentDialog(apt)}
                                      className="gap-1"
                                    >
                                      <CreditCard className="h-3 w-3" />
                                      Pagar
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Available Packages */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Pacotes Disponíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {availablePackages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p>Nenhum pacote disponível</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {availablePackages.map(pkg => (
                            <Card
                              key={pkg.id}
                              className={cn(
                                'cursor-pointer transition-all hover:shadow-md',
                                selectedPackage === pkg.id
                                  ? 'ring-2 ring-primary bg-primary/5'
                                  : 'hover:bg-muted/50'
                              )}
                              onClick={() => setSelectedPackage(pkg.id)}
                            >
                              <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-2">
                                  <h3 className="font-semibold text-sm">{pkg.name}</h3>
                                  {selectedPackage === pkg.id && (
                                    <CheckCircle className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    <span>{pkg.total_sessions} sessões</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{pkg.duration || 60} min</span>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t">
                                  <span className="text-base font-bold text-primary">
                                    R$ {Number(pkg.total_price).toFixed(2)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sale Panel */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Finalizar Venda
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentPackage ? (
                    <>
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <h3 className="font-semibold text-sm">{currentPackage.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentPackage.total_sessions} sessões • {currentPackage.duration || 60} min
                        </p>
                        <p className="text-xl font-bold text-primary mt-2">
                          R$ {Number(currentPackage.total_price).toFixed(2)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">Cliente *</Label>
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecione o cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map(client => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">Forma de Pagamento *</Label>
                        <div className="flex flex-wrap gap-1">
                          {PAYMENT_METHODS.map(method => (
                            <Badge
                              key={method.value}
                              variant={selectedPaymentMethods.includes(method.value) ? 'default' : 'outline'}
                              className="cursor-pointer text-xs"
                              onClick={() => togglePaymentMethod(method.value)}
                            >
                              {method.label}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={handleSale}
                        disabled={isProcessing || !selectedClient || selectedPaymentMethods.length === 0}
                      >
                        {isProcessing ? 'Processando...' : 'Confirmar Venda'}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Selecione um pacote</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <CashRegisterHistory
              closedRegisters={closedRegisters}
              isLoading={isLoadingCashRegisters}
            />
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <CashRegisterFilters
              dateRange={dateRange}
              setDateRange={setDateRange}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              customEndDate={customEndDate}
              setCustomEndDate={setCustomEndDate}
              paymentMethodFilter={paymentMethodFilter}
              setPaymentMethodFilter={setPaymentMethodFilter}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              clientFilter={clientFilter}
              setClientFilter={setClientFilter}
              professionals={professionals}
              clients={clients}
            />
            <CommissionsReport
              appointments={appointments}
              professionals={professionals}
              dateRange={getDateRange()}
              dateRangeLabel={
                dateRange === 'today' ? 'Hoje' :
                dateRange === 'yesterday' ? 'Ontem' :
                dateRange === 'last7days' ? 'Últimos 7 dias' :
                dateRange === 'last30days' ? 'Últimos 30 dias' :
                dateRange === 'thisMonth' ? 'Este mês' :
                'Período Personalizado'
              }
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              Venda Realizada!
            </DialogTitle>
            <DialogDescription>
              O pacote foi vendido com sucesso.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetSale}>
              Nova Venda
            </Button>
            <Button onClick={() => setShowSuccessDialog(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!paymentAppointment} onOpenChange={(open) => !open && setPaymentAppointment(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Registrar Pagamento
            </DialogTitle>
            <DialogDescription>
              {paymentAppointment?.client?.name} - {paymentAppointment?.service?.name}
            </DialogDescription>
          </DialogHeader>

          {paymentAppointment && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span>Valor do Serviço:</span>
                  <span className="font-medium">R$ {(paymentAppointment.service?.price || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Já Pago:</span>
                  <span className="font-medium text-success">R$ {(paymentAppointment.amount_paid || 0).toFixed(2)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="font-medium">A Pagar:</span>
                  <span className="font-bold text-warning">R$ {paymentAppointment.remainingAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Formas de Pagamento</Label>
                {paymentEntries.map((entry, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Forma</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={entry.method}
                        onChange={(e) => updatePaymentEntry(index, 'method', e.target.value)}
                      >
                        {PAYMENT_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={entry.amount}
                        onChange={(e) => updatePaymentEntry(index, 'amount', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    {paymentEntries.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => removePaymentEntry(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addPaymentEntry} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar forma
                </Button>
              </div>

              {canAddClientCredit && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-amber-500" />
                    <Label className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Crédito ao Cliente
                    </Label>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={clientCreditAmount}
                    onChange={(e) => setClientCreditAmount(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}

              {(totalPaymentValue > 0 || clientCredit > 0) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  {totalPaymentValue > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Valor recebido:</span>
                      <span className="font-semibold text-success">R$ {totalPaymentValue.toFixed(2)}</span>
                    </div>
                  )}
                  {clientCredit > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Crédito:</span>
                      <span className="font-semibold text-amber-500">R$ {clientCredit.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total:</span>
                    <span>R$ {totalWithCredit.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setPaymentAppointment(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleRegisterPayment}
                  disabled={isProcessingPayment || totalWithCredit <= 0}
                >
                  {isProcessingPayment ? 'Processando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
