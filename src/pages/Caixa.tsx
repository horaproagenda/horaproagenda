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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  CalendarIcon,
  Filter,
  Download,
  AlertTriangle,
  Phone,
  Gift,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

const DATE_RANGES = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7days', label: 'Últimos 7 dias' },
  { value: 'last30days', label: 'Últimos 30 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
];

export default function Caixa() {
  const { packages, refetch: refetchPackages } = useServicePackages();
  const { clients } = useClients();
  const { appointments, isLoading: isLoadingAppointments, updatePayment } = useAppointments();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  const canAddClientCredit = hasRole('admin');
  
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  
  // Report filters
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');

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
        return { start: startOfMonth(today), end: endOfMonth(today) };
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
      
      return true;
    });
  }, [appointments, dateRange, customStartDate, customEndDate, paymentMethodFilter, professionalFilter]);

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
      
      return true;
    }).map(apt => ({
      ...apt,
      remainingAmount: (apt.service?.price || 0) - (apt.amount_paid || 0),
    }));
  }, [appointments, dateRange, customStartDate, customEndDate]);

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
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Vendas
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-2">
            <FileText className="h-4 w-4" />
            Relatório de Caixa
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
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Available Packages */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Pacotes Disponíveis
                  </CardTitle>
                  <CardDescription>
                    Selecione um pacote para vender
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {availablePackages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum pacote disponível para venda</p>
                      <p className="text-sm">Crie pacotes na aba Serviços</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {availablePackages.map(pkg => (
                        <Card
                          key={pkg.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            selectedPackage === pkg.id
                              ? 'ring-2 ring-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setSelectedPackage(pkg.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-semibold">{pkg.name}</h3>
                              {selectedPackage === pkg.id && (
                                <CheckCircle className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            {pkg.description && (
                              <p className="text-sm text-muted-foreground mb-3">{pkg.description}</p>
                            )}
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarDays className="h-4 w-4" />
                                <span>{pkg.total_sessions} sessões</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>{pkg.duration || 60} min cada</span>
                              </div>
                              {pkg.professional && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <User className="h-4 w-4" />
                                  <span>{pkg.professional.name}</span>
                                </div>
                              )}
                            </div>
                            <div className="mt-3 pt-3 border-t">
                              <span className="text-lg font-bold text-primary">
                                R$ {Number(pkg.total_price).toFixed(2)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Sales */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Vendas Recentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {soldPackages.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Nenhuma venda realizada ainda</p>
                  ) : (
                    <div className="space-y-3">
                      {soldPackages.slice(0, 5).map(pkg => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div>
                            <p className="font-medium">{pkg.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {pkg.client?.name} • {pkg.total_sessions} sessões
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">R$ {Number(pkg.total_price).toFixed(2)}</p>
                            <div className="flex gap-1 mt-1">
                              {(pkg.payment_methods || [pkg.payment_method]).filter(Boolean).map((method: string) => (
                                <Badge key={method} variant="secondary" className="text-xs">
                                  {PAYMENT_LABELS[method] || method}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sale Panel */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Finalizar Venda
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentPackage ? (
                    <>
                      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                        <h3 className="font-semibold">{currentPackage.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {currentPackage.total_sessions} sessões • {currentPackage.duration || 60} min
                        </p>
                        <p className="text-2xl font-bold text-primary mt-2">
                          R$ {Number(currentPackage.total_price).toFixed(2)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Cliente *</Label>
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map(client => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name} - {client.phone}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Forma de Pagamento *</Label>
                        <div className="flex flex-wrap gap-2">
                          {PAYMENT_METHODS.map(method => (
                            <Badge
                              key={method.value}
                              variant={selectedPaymentMethods.includes(method.value) ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => togglePaymentMethod(method.value)}
                            >
                              {method.label}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleSale}
                        disabled={isProcessing || !selectedClient || selectedPaymentMethods.length === 0}
                      >
                        {isProcessing ? 'Processando...' : 'Confirmar Venda'}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Selecione um pacote para iniciar a venda</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Report Tab */}
        <TabsContent value="report" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Recebido</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {totals.total.toFixed(2)}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pagamentos</p>
                    <p className="text-2xl font-bold">{totals.count}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ticket Médio</p>
                    <p className="text-2xl font-bold">
                      R$ {totals.count > 0 ? (totals.total / totals.count).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGES.map(range => (
                        <SelectItem key={range.value} value={range.value}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {dateRange === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <Label>Data Inicial</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !customStartDate && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customStartDate ? format(customStartDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customStartDate}
                            onSelect={setCustomStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Data Final</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !customEndDate && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customEndDate ? format(customEndDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customEndDate}
                            onSelect={setCustomEndDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Forma de Pagamento</Label>
                  <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {PAYMENT_METHODS.map(method => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Profissional</Label>
                  <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {professionals.filter(p => p.is_active).map(prof => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payments by Method */}
          {Object.keys(totals.byMethod).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Por Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(totals.byMethod).map(([method, amount]) => (
                    <div
                      key={method}
                      className="p-4 rounded-lg bg-muted/50 text-center"
                    >
                      <p className="text-sm text-muted-foreground mb-1">
                        {PAYMENT_LABELS[method] || method}
                      </p>
                      <p className="font-bold">R$ {Number(amount).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transactions Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Transações
              </CardTitle>
              <Button variant="outline" size="sm" onClick={exportReport} disabled={paidAppointments.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingAppointments ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : paidAppointments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum pagamento encontrado no período selecionado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
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
                          <TableCell>
                            {format(parseISO(apt.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </TableCell>
                          <TableCell className="font-medium">
                            {apt.client?.name || '-'}
                          </TableCell>
                          <TableCell>
                            {apt.service?.name || '-'}
                          </TableCell>
                          <TableCell>
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
                        <TableCell colSpan={5}>TOTAL</TableCell>
                        <TableCell className="text-right text-primary">
                          R$ {totals.total.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receivables Tab */}
        <TabsContent value="receivables" className="space-y-6">
          {/* Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total a Receber</p>
                    <p className="text-2xl font-bold text-warning">
                      R$ {totalReceivables.toFixed(2)}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Clientes com Pendência</p>
                    <p className="text-2xl font-bold">{receivablesByClient.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Agendamentos Pendentes</p>
                    <p className="text-2xl font-bold">{receivables.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <CalendarDays className="h-6 w-6 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Date Filter for Receivables */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtrar por Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGES.map(range => (
                        <SelectItem key={range.value} value={range.value}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {dateRange === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <Label>Data Inicial</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !customStartDate && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customStartDate ? format(customStartDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customStartDate}
                            onSelect={setCustomStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Data Final</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !customEndDate && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customEndDate ? format(customEndDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customEndDate}
                            onSelect={setCustomEndDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Receivables by Client */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Valores a Receber por Cliente
              </CardTitle>
              <CardDescription>
                Clientes com valores pendentes de pagamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAppointments ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                  ))}
                </div>
              ) : receivablesByClient.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success opacity-50" />
                  <p>Nenhum valor pendente no período selecionado</p>
                  <p className="text-sm">Todos os pagamentos estão em dia!</p>
                </div>
              ) : (
                <div className="space-y-4">
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
                            <p className="text-sm text-muted-foreground">Total em aberto</p>
                            <p className="text-xl font-bold text-warning">R$ {totalRemaining.toFixed(2)}</p>
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
                                  <p className="text-sm">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              Venda Realizada!
            </DialogTitle>
            <DialogDescription>
              O pacote foi vendido com sucesso. O cliente agora pode agendar suas sessões.
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
        <DialogContent>
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
                      <Label className="text-xs">Forma de Pagamento</Label>
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
                  Adicionar forma de pagamento
                </Button>
              </div>

              {/* Client Credit Section - Admin Only */}
              {canAddClientCredit && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-amber-500" />
                    <Label className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Crédito ao Cliente
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    O valor não será contabilizado como recebimento, ficará como crédito do cliente.
                  </p>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={clientCreditAmount}
                    onChange={(e) => setClientCreditAmount(e.target.value)}
                  />
                </div>
              )}

              {/* Payment summary */}
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
                      <span>Crédito ao cliente:</span>
                      <span className="font-semibold text-amber-500">R$ {clientCredit.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total a quitar:</span>
                    <span>R$ {totalWithCredit.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setPaymentAppointment(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleRegisterPayment}
                  disabled={isProcessingPayment || totalWithCredit <= 0}
                >
                  {isProcessingPayment ? 'Processando...' : 'Confirmar Pagamento'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
