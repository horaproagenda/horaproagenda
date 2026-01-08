import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Appointment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { format } from 'date-fns';
import { Download, Calendar, Clock, DollarSign, CreditCard, Edit, XCircle, AlertCircle } from 'lucide-react';
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
  status: 'paid' | 'partial' | 'pending';
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

export function ClientReportTab({ appointments, clientName, paymentHistory = [], onEditAppointment }: ClientReportTabProps) {
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<PaymentHistoryItem | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [usedSessionsValue, setUsedSessionsValue] = useState('0');
  const [penaltyAmount, setPenaltyAmount] = useState('0');

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
  
  // Helper to get payment method name from ID or return as-is if already a name
  const getPaymentMethodName = (methodIdOrName: string): string => {
    if (!methodIdOrName || methodIdOrName === '-') return methodIdOrName;
    // Check if it's a UUID (payment method ID)
    if (methodIdOrName.includes('-') && methodIdOrName.length > 30) {
      return paymentMethodMap.get(methodIdOrName) || methodIdOrName;
    }
    return methodIdOrName;
  };

  // Calculate summary
  const summary = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed');
    const totalValue = completed.reduce((sum, a) => sum + (a.amount_paid || a.service?.price || 0), 0);
    const totalPending = paymentHistory
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + p.pendingAmount, 0);
    
    return {
      total: appointments.length,
      completed: completed.length,
      totalValue,
      totalPending,
    };
  }, [appointments, paymentHistory]);

  // Cancel sale mutation
  const cancelSaleMutation = useMutation({
    mutationFn: async ({ saleId, packageId, refundAmount }: { saleId?: string; packageId?: string; refundAmount: number }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create refund transaction in cash
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
          created_by: user?.id,
        });
      }

      // Create expense entry in financial
      await supabase.from('financial_entries').insert({
        type: 'payable',
        description: `Devolução: ${selectedSale?.serviceName}`,
        amount: refundAmount,
        due_date: format(new Date(), 'yyyy-MM-dd'),
        paid_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'paid',
        created_by: user?.id,
      });

      // If it's a sale, mark as cancelled
      if (saleId) {
        await supabase
          .from('single_sales')
          .update({ 
            notes: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)}`,
            final_amount: 0,
          })
          .eq('id', saleId);
      }

      // If it's a package, deactivate it
      if (packageId) {
        await supabase
          .from('service_packages')
          .update({ is_active: false })
          .eq('id', packageId);
      }

      return { refundAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
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
      refundAmount,
    });
  };

  const openCancelDialog = (payment: PaymentHistoryItem) => {
    setSelectedSale(payment);
    setRefundType('full');
    setUsedSessionsValue('0');
    setPenaltyAmount('0');
    setCancelDialogOpen(true);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Horário', 'Serviço', 'Categoria', 'Duração (min)', 'Valor', 'Status'];
    const rows = appointments.map(appointment => [
      format(new Date(appointment.start_time), 'dd/MM/yyyy'),
      `${format(new Date(appointment.start_time), 'HH:mm')} - ${format(new Date(appointment.end_time), 'HH:mm')}`,
      appointment.service?.name || '-',
      appointment.service?.category || '-',
      appointment.service?.duration?.toString() || '-',
      `R$ ${(appointment.service?.price || 0).toFixed(2)}`,
      statusConfig[appointment.status]?.label || appointment.status,
    ]);
    
    const csvContent = [
      `Relatório Completo - ${clientName}`,
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
    link.download = `relatorio_${clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Export Button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={exportToCSV}>
          <Download className="h-4 w-4 mr-1" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Agendado</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Procedimentos Realizados</p>
                <p className="text-2xl font-bold">{summary.completed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Pago</p>
                <p className="text-2xl font-bold">R$ {summary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {summary.totalPending > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Pendente</p>
                  <p className="text-2xl font-bold text-amber-600">R$ {summary.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment History - from both agenda and caixa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
          ) : (
            <div className="space-y-2">
              {paymentHistory.slice(0, 20).map(payment => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-muted-foreground w-20">{format(new Date(payment.date), 'dd/MM/yy')}</span>
                    <span className="font-medium truncate max-w-[200px]">{payment.serviceName}</span>
                    <Badge variant="outline" className="text-xs">
                      {payment.source === 'sale' ? 'Caixa' : 'Agenda'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                        R$ {Number(payment.amount).toFixed(2)}
                      </div>
                      {payment.pendingAmount > 0 && (
                        <div className="text-xs text-amber-600">
                          Pendente: R$ {payment.pendingAmount.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant={payment.status === 'paid' ? 'default' : payment.status === 'partial' ? 'secondary' : 'outline'}
                      className={payment.status === 'paid' ? 'bg-emerald-500' : payment.status === 'partial' ? 'bg-amber-500' : ''}
                    >
                      {payment.status === 'paid' ? 'Pago' : payment.status === 'partial' ? 'Parcial' : 'Pendente'}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {payment.paymentMethod}
                    </Badge>
                    {payment.saleId && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => openCancelDialog(payment)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Histórico Detalhado</CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum agendamento encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Valor Pago</TableHead>
                    <TableHead>Pendente</TableHead>
                    <TableHead>Status Pgto.</TableHead>
                    <TableHead>Forma Pgto.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {appointments.slice(0, 20).map(appointment => {
                    const status = statusConfig[appointment.status] || statusConfig.scheduled;
                    
                    // Get service/package info
                    const isPackageAppointment = !!appointment.package_appointment?.package;
                    const packagePaymentMethods = appointment.package_appointment?.package?.payment_methods;
                    const isPackagePaid = isPackageAppointment && 
                      packagePaymentMethods && packagePaymentMethods.length > 0;
                    
                    const isPaid = appointment.payment_status === 'paid' || isPackagePaid;
                    const isPartial = appointment.payment_status === 'partial';
                    
                    // Get total price and paid amount
                    const totalPrice = appointment.service?.price || 
                      appointment.package_appointment?.package?.total_price || 0;
                    const amountPaid = appointment.amount_paid || 0;
                    const pendingAmount = Math.max(0, totalPrice - amountPaid);
                    
                    // Map payment method IDs to names
                    const paymentMethods = appointment.payment_methods?.length > 0 
                      ? appointment.payment_methods.map(pm => getPaymentMethodName(pm)).join(', ') 
                      : isPackagePaid
                        ? (packagePaymentMethods?.map(pm => getPaymentMethodName(pm)).join(', ') || 'Pacote')
                        : '-';
                    
                    // Get service name
                    const serviceName = appointment.service?.name || 
                                       appointment.package_appointment?.package?.name || 
                                       '-';
                    
                    return (
                      <TableRow key={appointment.id}>
                        <TableCell className="text-sm">
                          {format(new Date(appointment.start_time), "dd/MM/yy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {serviceName}
                        </TableCell>
                        <TableCell className="text-sm">
                          R$ {totalPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm text-emerald-600 font-medium">
                          R$ {amountPaid.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {pendingAmount > 0 ? (
                            <span className="text-amber-600 font-medium">R$ {pendingAmount.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isPaid ? (
                            <Badge className="bg-emerald-500 text-white text-xs">Pago</Badge>
                          ) : isPartial ? (
                            <Badge className="bg-amber-500 text-white text-xs">Parcial</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {paymentMethods}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => onEditAppointment?.(appointment)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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
            <DialogTitle>Cancelar Venda</DialogTitle>
            <DialogDescription>
              Escolha como realizar a devolução para o cliente.
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedSale.serviceName}</p>
                <p className="text-sm text-muted-foreground">
                  Valor pago: R$ {selectedSale.amount.toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Tipo de devolução</Label>
                <Select value={refundType} onValueChange={(v: 'full' | 'partial') => setRefundType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Devolução integral</SelectItem>
                    <SelectItem value="partial">Considerar sessões usadas / multas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {refundType === 'partial' && (
                <div className="space-y-3 p-3 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Valor das sessões usadas (R$)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={usedSessionsValue}
                      onChange={(e) => setUsedSessionsValue(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Multa / Penalidade (R$)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={penaltyAmount}
                      onChange={(e) => setPenaltyAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      Valor a devolver:{' '}
                      <span className="font-bold text-foreground">
                        R$ {Math.max(0, selectedSale.amount - (parseFloat(usedSessionsValue) || 0) - (parseFloat(penaltyAmount) || 0)).toFixed(2)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelSale}
              disabled={cancelSaleMutation.isPending}
            >
              Confirmar Devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}