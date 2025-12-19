import { useState, useMemo } from 'react';
import { Appointment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Calendar, Clock, DollarSign, CreditCard, Edit } from 'lucide-react';

interface PaymentHistoryItem {
  id: string;
  date: string;
  description: string;
  serviceName: string;
  amount: number;
  paymentMethod: string;
  source: 'appointment' | 'sale';
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    appointments.forEach(a => {
      if (a.service?.category) cats.add(a.service.category);
    });
    return Array.from(cats).sort();
  }, [appointments]);

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter(appointment => {
      // Category filter
      if (categoryFilter !== 'all' && appointment.service?.category !== categoryFilter) {
        return false;
      }
      
      // Status filter
      if (statusFilter !== 'all' && appointment.status !== statusFilter) {
        return false;
      }
      
      // Date range filter
      const appointmentDate = new Date(appointment.start_time);
      if (startDate && appointmentDate < new Date(startDate)) {
        return false;
      }
      if (endDate && appointmentDate > new Date(endDate + 'T23:59:59')) {
        return false;
      }
      
      return true;
    });
  }, [appointments, categoryFilter, statusFilter, startDate, endDate]);

  // Calculate summary
  const summary = useMemo(() => {
    const completed = filteredAppointments.filter(a => a.status === 'completed');
    const totalValue = completed.reduce((sum, a) => sum + (a.amount_paid || a.service?.price || 0), 0);
    
    // Group by service
    const serviceMap = new Map<string, { count: number; total: number }>();
    completed.forEach(a => {
      const serviceName = a.service?.name || a.package_appointment?.package?.name || 'Desconhecido';
      const current = serviceMap.get(serviceName) || { count: 0, total: 0 };
      serviceMap.set(serviceName, {
        count: current.count + 1,
        total: current.total + (a.amount_paid || a.service?.price || 0),
      });
    });
    
    return {
      total: filteredAppointments.length,
      completed: completed.length,
      totalValue,
      byService: Array.from(serviceMap.entries()).map(([name, data]) => ({
        name,
        ...data,
      })),
    };
  }, [filteredAppointments]);

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
      `Relatório Completo - ${clientName}`,
      `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      'RESUMO',
      `Total de procedimentos: ${summary.completed}`,
      `Valor total: R$ ${summary.totalValue.toFixed(2)}`,
      '',
      'POR SERVIÇO',
      ...summary.byService.map(s => `${s.name}: ${s.count}x - R$ ${s.total.toFixed(2)}`),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setCategoryFilter('all');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      {/* Filters - simplified without extra card wrapper */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="space-y-1">
          <Label className="text-xs">Categoria</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Realizado</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs">Data Inicial</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[140px] h-9"
          />
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs">Data Final</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[140px] h-9"
          />
        </div>

        <Button variant="outline" size="sm" onClick={clearFilters}>
          Limpar
        </Button>
        <Button size="sm" onClick={exportToCSV}>
          <Download className="h-4 w-4 mr-1" />
          Exportar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">R$ {summary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
              {paymentHistory.slice(0, 15).map(payment => (
                <div key={payment.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{format(new Date(payment.date), 'dd/MM/yy')}</span>
                    <span className="font-medium truncate max-w-[150px]">{payment.serviceName}</span>
                    <Badge variant="outline" className="text-xs">
                      {payment.source === 'sale' ? 'Caixa' : 'Agenda'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {payment.paymentMethod}
                    </Badge>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      R$ {Number(payment.amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Summary */}
      {summary.byService.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resumo por Procedimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {summary.byService.map(service => (
                <div key={service.name} className="p-2 bg-muted/50 rounded-lg">
                  <p className="font-medium text-sm text-foreground truncate">{service.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {service.count}x - R$ {service.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Histórico Detalhado</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAppointments.length === 0 ? (
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
                    <TableHead>Valor Pago</TableHead>
                    <TableHead>Status Pgto.</TableHead>
                    <TableHead>Forma Pgto.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.slice(0, 20).map(appointment => {
                    const status = statusConfig[appointment.status] || statusConfig.scheduled;
                    const isPaid = appointment.payment_status === 'paid' || 
                                   (appointment.package_appointment && appointment.package_appointment.package);
                    const paymentMethods = appointment.payment_methods?.length > 0 
                      ? appointment.payment_methods.join(', ') 
                      : appointment.package_appointment?.package 
                        ? 'Pacote' 
                        : '-';
                    
                    // Get service name - check service first, then package
                    const serviceName = appointment.service?.name || 
                                       appointment.package_appointment?.package?.name || 
                                       '-';
                    
                    // Get actual paid amount
                    const amountPaid = appointment.amount_paid || 0;
                    
                    return (
                      <TableRow key={appointment.id}>
                        <TableCell className="text-sm">
                          {format(new Date(appointment.start_time), "dd/MM/yy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {serviceName}
                        </TableCell>
                        <TableCell className="text-sm">
                          R$ {amountPaid.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isPaid ? (
                            <Badge className="bg-emerald-500 text-white text-xs">Pago</Badge>
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
    </div>
  );
}
