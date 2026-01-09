import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Appointment } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Calendar, Clock, DollarSign, Edit, XCircle, AlertCircle, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PaymentHistoryItem {
  id: string;
  date: string;
  description: string;
  serviceName: string;
  amount: number;
  totalPrice: number;
  pendingAmount: number;
  paymentMethod: string;
  source: 'appointment' | 'sale';
  status: 'paid' | 'partial' | 'pending' | 'cancelled';
  saleId?: string;
  packageId?: string;
  serviceId?: string;
}

interface ClientReportTabProps {
  appointments: Appointment[];
  clientName: string;
  paymentHistory?: PaymentHistoryItem[];
  onEditAppointment?: (appointment: Appointment) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Agendado', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  completed: { label: 'Realizado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

// Generate month options for filtering
const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

export function ClientReportTab({ appointments, clientName, paymentHistory = [], onEditAppointment }: ClientReportTabProps) {
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<PaymentHistoryItem | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [usedSessionsValue, setUsedSessionsValue] = useState('0');
  const [penaltyAmount, setPenaltyAmount] = useState('0');
  const [refundMethod, setRefundMethod] = useState('Dinheiro');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const monthOptions = useMemo(() => getMonthOptions(), []);

  // Filter data by selected month
  const filterByMonth = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
      const monthEnd = endOfMonth(monthStart);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    } catch {
      return false;
    }
  };

  const filteredPaymentHistory = useMemo(() => 
    paymentHistory.filter(p => filterByMonth(p.date)),
    [paymentHistory, selectedMonth]
  );

  const filteredAppointments = useMemo(() => 
    appointments.filter(a => filterByMonth(a.start_time)),
    [appointments, selectedMonth]
  );

  // Fetch payment methods for mapping IDs to names
  const { data: paymentMethodsData = [] } = useQuery({
    queryKey: ['payment_methods_for_report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });
  
  const paymentMethodMap = useMemo(() => 
    new Map(paymentMethodsData.map(pm => [pm.id, pm.name])),
    [paymentMethodsData]
  );
  
  const getPaymentMethodName = (methodIdOrName: string): string => {
    if (!methodIdOrName || methodIdOrName === '-') return methodIdOrName;
    if (methodIdOrName.includes('-') && methodIdOrName.length > 30) {
      return paymentMethodMap.get(methodIdOrName) || methodIdOrName;
    }
    return methodIdOrName;
  };

  // Calculate summary for filtered month
  const summary = useMemo(() => {
    const completed = filteredAppointments.filter(a => a.status === 'completed');
    const totalValue = completed.reduce((sum, a) => sum + (a.amount_paid || a.service?.price || 0), 0);
    const totalPending = filteredPaymentHistory
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + p.pendingAmount, 0);
    
    return {
      total: filteredAppointments.length,
      completed: completed.length,
      totalValue,
      totalPending,
    };
  }, [filteredAppointments, filteredPaymentHistory]);

  // Cancel sale mutation
  const cancelSaleMutation = useMutation({
    mutationFn: async ({ saleId, packageId, serviceId, refundAmount, refundMethod }: { 
      saleId?: string; 
      packageId?: string; 
      serviceId?: string;
      refundAmount: number;
      refundMethod?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data: openRegister } = await supabase
        .from('cash_registers')
        .select('id')
        .eq('status', 'open')
        .maybeSingle();

      if (openRegister) {
        await supabase.from('cash_transactions').insert({
          cash_register_id: openRegister.id,
          type: 'expense',
          category: 'refund',
          description: `Devolução: ${selectedSale?.serviceName}`,
          amount: refundAmount,
          reference_id: saleId,
          reference_type: 'refund',
          created_by: user?.id,
        });
      }

      await supabase.from('financial_entries').insert({
        type: 'payable',
        description: `Devolução: ${selectedSale?.serviceName}`,
        amount: refundAmount,
        due_date: today,
        paid_date: today,
        status: 'paid',
        notes: `Cancelamento de venda - Método: ${refundMethod || 'Não especificado'}`,
        created_by: user?.id,
      });

      if (saleId && serviceId) {
        await supabase
          .from('client_services')
          .update({ 
            status: 'expired',
            notes: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)} em ${today}`
          })
          .eq('sale_id', saleId);
      }

      if (saleId) {
        await supabase
          .from('single_sales')
          .update({ 
            notes: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)} - ${refundMethod || 'Não especificado'}`,
            final_amount: 0,
          })
          .eq('id', saleId);
      }

      if (packageId) {
        await supabase
          .from('service_packages')
          .update({ 
            is_active: false,
            description: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)}`
          })
          .eq('id', packageId);

        await supabase
          .from('package_appointments')
          .update({ status: 'cancelled' })
          .eq('package_id', packageId)
          .eq('status', 'pending');
      }

      return { refundAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      toast.success(`Venda cancelada! Devolução de R$ ${data.refundAmount.toFixed(2)} registrada.`);
      setCancelDialogOpen(false);
      setSelectedSale(null);
    },
    onError: (error: any) => {
      toast.error('Erro ao cancelar venda: ' + error.message);
    },
  });

  const handleCancelSale = () => {
    if (!selectedSale) return;

    let refundAmount = selectedSale.amount;

    if (refundType === 'partial') {
      const usedValue = parseFloat(usedSessionsValue) || 0;
      const penalty = parseFloat(penaltyAmount) || 0;
      refundAmount = selectedSale.amount - usedValue - penalty;
    }

    if (refundAmount < 0) refundAmount = 0;

    cancelSaleMutation.mutate({
      saleId: selectedSale.saleId,
      packageId: selectedSale.packageId,
      serviceId: selectedSale.serviceId,
      refundAmount,
      refundMethod,
    });
  };

  const openCancelDialog = (payment: PaymentHistoryItem) => {
    setSelectedSale(payment);
    setRefundType('full');
    setUsedSessionsValue('0');
    setPenaltyAmount('0');
    setRefundMethod('Dinheiro');
    setCancelDialogOpen(true);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Horário', 'Serviço', 'Categoria', 'Duração (min)', 'Valor', 'Status'];
    const rows = filteredAppointments.map(appointment => [
      format(new Date(appointment.start_time), 'dd/MM/yyyy'),
      `${format(new Date(appointment.start_time), 'HH:mm')} - ${format(new Date(appointment.end_time), 'HH:mm')}`,
      appointment.service?.name || '-',
      appointment.service?.category || '-',
      appointment.service?.duration?.toString() || '-',
      `R$ ${(appointment.service?.price || 0).toFixed(2)}`,
      statusConfig[appointment.status]?.label || appointment.status,
    ]);
    
    const csvContent = [
      `Relatório - ${clientName} - ${format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: ptBR })}`,
      `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      'RESUMO',
      `Total de procedimentos: ${summary.completed}`,
      `Valor total: R$ ${summary.totalValue.toFixed(2)}`,
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${clientName.replace(/\s+/g, '_')}_${selectedMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Filters Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={exportToCSV} className="h-8 text-xs">
          <Download className="h-3.5 w-3.5 mr-1" />
          CSV
        </Button>
      </div>

      {/* Compact Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-lg font-bold">{summary.total}</p>
                <p className="text-[10px] text-muted-foreground">Agendados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-lg font-bold">{summary.completed}</p>
                <p className="text-[10px] text-muted-foreground">Realizados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-lg font-bold">R$ {summary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-muted-foreground">Recebido</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {summary.totalPending > 0 && (
          <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-lg font-bold text-amber-600">R$ {summary.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-muted-foreground">Pendente</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment History - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Histórico de Pagamentos</h3>
          {filteredPaymentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum pagamento neste mês</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {filteredPaymentHistory.map(payment => (
                <div key={payment.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-muted-foreground shrink-0">{format(new Date(payment.date), 'dd/MM')}</span>
                    <span className="font-medium truncate">{payment.serviceName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-emerald-600">
                      R$ {Number(payment.amount).toFixed(0)}
                    </span>
                    <Badge 
                      variant={payment.status === 'paid' ? 'default' : payment.status === 'cancelled' ? 'destructive' : 'secondary'}
                      className={`text-[10px] px-1.5 py-0 ${payment.status === 'paid' ? 'bg-emerald-500' : ''}`}
                    >
                      {payment.status === 'paid' ? 'Pago' : payment.status === 'cancelled' ? 'Canc.' : 'Pend.'}
                    </Badge>
                    {payment.saleId && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => openCancelDialog(payment)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Histórico Detalhado</h3>
          {filteredAppointments.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum agendamento neste mês</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] py-1.5 h-auto">Data</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto">Serviço</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto text-right">Valor</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto text-right">Pago</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto">Status</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.slice(0, 20).map(appointment => {
                    const status = statusConfig[appointment.status] || statusConfig.scheduled;
                    const isPackage = !!appointment.package_appointment?.package;
                    const packagePaymentMethods = appointment.package_appointment?.package?.payment_methods;
                    const isPackagePaid = isPackage && packagePaymentMethods && packagePaymentMethods.length > 0;
                    
                    const serviceName = isPackage 
                      ? appointment.package_appointment?.package?.name 
                      : appointment.service?.name;
                    
                    const totalPrice = isPackage
                      ? (appointment.package_appointment?.package?.total_price || 0) / (appointment.package_appointment?.package?.total_sessions || 1)
                      : appointment.service?.price || 0;
                    
                    const amountPaid = isPackagePaid ? totalPrice : (appointment.amount_paid || 0);
                    const pendingAmount = totalPrice - amountPaid;
                    
                    return (
                      <TableRow key={appointment.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs py-1.5">
                          {format(new Date(appointment.start_time), 'dd/MM')}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[120px] truncate">
                          {serviceName || '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right">
                          R$ {totalPrice.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right">
                          <span className={amountPaid > 0 ? 'text-emerald-600' : 'text-muted-foreground'}>
                            R$ {amountPaid.toFixed(0)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0">
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          {onEditAppointment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => onEditAppointment(appointment)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Sale Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Cancelar Venda</DialogTitle>
            <DialogDescription className="text-xs">
              {selectedSale?.serviceName} - R$ {selectedSale?.amount.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tipo de Devolução</Label>
              <Select value={refundType} onValueChange={(v: 'full' | 'partial') => setRefundType(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full" className="text-xs">Devolução Total</SelectItem>
                  <SelectItem value="partial" className="text-xs">Devolução Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {refundType === 'partial' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Valor Sessões Utilizadas</Label>
                  <Input
                    type="number"
                    value={usedSessionsValue}
                    onChange={(e) => setUsedSessionsValue(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Multa/Penalidade</Label>
                  <Input
                    type="number"
                    value={penaltyAmount}
                    onChange={(e) => setPenaltyAmount(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Método de Devolução</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dinheiro" className="text-xs">Dinheiro</SelectItem>
                  <SelectItem value="PIX" className="text-xs">PIX</SelectItem>
                  <SelectItem value="Transferência" className="text-xs">Transferência</SelectItem>
                  <SelectItem value="Crédito em Conta" className="text-xs">Crédito em Conta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-2 bg-muted rounded text-xs">
              <p className="font-medium">
                Valor da Devolução: R$ {(
                  refundType === 'full' 
                    ? selectedSale?.amount || 0
                    : Math.max(0, (selectedSale?.amount || 0) - parseFloat(usedSessionsValue || '0') - parseFloat(penaltyAmount || '0'))
                ).toFixed(2)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleCancelSale}
              disabled={cancelSaleMutation.isPending}
            >
              {cancelSaleMutation.isPending ? 'Processando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}