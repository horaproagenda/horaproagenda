import { useEffect, useMemo, useState } from 'react';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Calendar, Clock, DollarSign, Edit, XCircle, AlertCircle, Filter, Trash2, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useEquipment } from '@/hooks/useEquipment';
import { useAppointments } from '@/hooks/useAppointments';
import { getAppointmentStatusConfig } from '@/lib/appointmentStatus';
import {
  buildAppointmentPackageSequenceMap,
  buildAppointmentRecurringSequenceMap,
  getAppointmentRecurringSessionLabel,
  getPackageApplicationLabel,
} from '@/lib/packageSequence';
import { isClientCreditPaymentMethod, CLIENT_CREDIT_SOURCE_LABEL, NON_CASH_PAYMENT_LABEL } from '@/lib/clientCreditPayment';
import { exportToCSV as exportRowsToCSV } from '@/lib/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  clientId?: string;
  paymentHistory?: PaymentHistoryItem[];
  onEditAppointment?: (appointment: Appointment) => void;
}

interface PendingPackageSession {
  id: string;
  session_number: number | null;
  sequence_order: number | null;
  scheduled_date: string | null;
  status: string | null;
  package: {
    id: string;
    name: string | null;
    total_sessions: number | null;
    interval_days: number | null;
    professional?: { name: string | null } | null;
    room?: { name: string | null } | null;
    service?: { name: string | null } | null;
    equipment?: string[] | null;
  } | null;
}

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Realizado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'missed', label: 'Faltou' },
  { value: 'rescheduled', label: 'Reagendado' },
];

// Generate month options for filtering
const getMonthOptions = () => {
  const options = [
    { value: 'all', label: 'Todos os meses' }
  ];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

export function ClientReportTab({ appointments, clientName, clientId, paymentHistory = [], onEditAppointment }: ClientReportTabProps) {
  const queryClient = useQueryClient();
  const { equipment } = useEquipment();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<PaymentHistoryItem | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [usedSessionsValue, setUsedSessionsValue] = useState('0');
  const [penaltyAmount, setPenaltyAmount] = useState('0');
  const [refundMethod, setRefundMethod] = useState('Dinheiro');
  const [selectedMonth, setSelectedMonth] = useState('all'); // Default to all months
  const [selectedStatus, setSelectedStatus] = useState('all'); // Status filter
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [healingPackages, setHealingPackages] = useState(false);
  const { propagateSeriesDates } = useRecurringAppointments();
  const { deleteAppointment, updateAppointment } = useAppointments();

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const packageSequenceMap = useMemo(() => buildAppointmentPackageSequenceMap(appointments), [appointments]);
  const recurringSequenceMap = useMemo(() => buildAppointmentRecurringSequenceMap(appointments), [appointments]);

  const resolvedClientIdEarly = clientId || appointments[0]?.client_id || '';

  // Auto-heal: when opening a client profile, try to relink orphan package appointments
  // (e.g. created after a package was deleted/resold without proper service_id).
  // Runs once per client per session to avoid loops.
  useEffect(() => {
    if (!resolvedClientIdEarly) return;
    const key = `pkg-heal-${resolvedClientIdEarly}`;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(key)) return;
    (async () => {
      try {
        await (supabase as any).rpc('heal_client_package_appointments', { _client_id: resolvedClientIdEarly });
        if (typeof window !== 'undefined') window.sessionStorage.setItem(key, '1');
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
        queryClient.invalidateQueries({ queryKey: ['service_packages'] });
        queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
        queryClient.invalidateQueries({ queryKey: ['client-pending-package-sessions', resolvedClientIdEarly] });
      } catch (e) {
        console.warn('[heal_client_package_appointments] skipped:', e);
      }
    })();
  }, [resolvedClientIdEarly, queryClient]);

  const handleManualHeal = async () => {
    if (!resolvedClientIdEarly) return;
    setHealingPackages(true);
    try {
      const { data, error } = await (supabase as any).rpc('heal_client_package_appointments', { _client_id: resolvedClientIdEarly });
      if (error) throw error;
      const linked = (data?.linkedAppointments ?? 0) as number;
      const svc = (data?.serviceFieldsFixed ?? 0) as number;
      toast.success(`Pacotes reparados: ${linked} sessão(ões) vinculadas, ${svc} serviço(s) preenchidos.`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-pending-package-sessions', resolvedClientIdEarly] });
    } catch (e: any) {
      toast.error('Falha ao reparar pacotes: ' + (e.message || 'erro desconhecido'));
    } finally {
      setHealingPackages(false);
    }
  };

  const [purging, setPurging] = useState(false);
  const handlePurgeOrphans = async () => {
    if (!resolvedClientIdEarly) return;
    if (!confirm('Apagar permanentemente todos os agendamentos órfãos de pacotes excluídos deste cliente? Esta ação não pode ser desfeita.')) return;
    setPurging(true);
    try {
      const { data, error } = await (supabase as any).rpc('purge_orphan_cancelled_appointments', { _client_id: resolvedClientIdEarly });
      if (error) throw error;
      const deleted = (data?.deleted ?? 0) as number;
      toast.success(deleted > 0 ? `${deleted} agendamento(s) órfão(s) apagado(s) permanentemente.` : 'Nenhum agendamento órfão encontrado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
    } catch (e: any) {
      toast.error('Falha ao limpar histórico: ' + (e.message || 'erro desconhecido'));
    } finally {
      setPurging(false);
    }
  };



  // Filter data by selected month (or show all if 'all' selected)
  const filterByMonth = (dateStr: string) => {
    if (selectedMonth === 'all') return true;
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
    paymentHistory
      .filter(p => p.status === 'paid' && Number(p.amount || 0) > 0)
      .filter(p => filterByMonth(p.date))
      .filter(p => {
        if (paymentTypeFilter === 'all') return true;
        const isClientCredit = isClientCreditPaymentMethod(p.paymentMethod);
        if (paymentTypeFilter === 'client_credit') return isClientCredit;
        if (paymentTypeFilter === 'non_cash') return isClientCredit;
        return true;
      }),
    [paymentHistory, selectedMonth, paymentTypeFilter]
  );

  const equipmentNameMap = useMemo(() => new Map(equipment.map(item => [item.id, item.name])), [equipment]);

  const getEquipmentNames = (items: string[] = []) => items
    .map(item => equipmentNameMap.get(item) || item)
    .filter(Boolean)
    .join(', ');

  // Fetch package sessions that are still pending (not yet scheduled in agenda).
  // These appear in package counters ("2 aplicações para concluir") but had no row here.
  const resolvedClientId = resolvedClientIdEarly;
  const { data: pendingPackageSessions = [] } = useQuery<PendingPackageSession[]>({
    queryKey: ['client-pending-package-sessions', resolvedClientId],
    enabled: !!resolvedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`
          id, session_number, sequence_order, scheduled_date, status, appointment_id,
          package:service_packages!inner(
            id, name, total_sessions, interval_days, client_id,
            professional:professionals(name),
            room:rooms(name),
            service:services(name),
            equipment
          )
        `)
        .is('appointment_id', null)
        .not('status', 'in', '(completed,missed)')
        .eq('package.client_id', resolvedClientId);
      if (error) throw error;
      return (data || []) as unknown as PendingPackageSession[];
    },
    staleTime: 15_000,
  });

  const filteredAppointments = useMemo(() =>
    appointments.filter(a => {
      const matchesMonth = filterByMonth(a.start_time);
      const matchesStatus = selectedStatus === 'all' || a.status === selectedStatus;
      return matchesMonth && matchesStatus;
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [appointments, selectedMonth, selectedStatus]
  );

  const filteredPendingSessions = useMemo(() => {
    if (selectedStatus !== 'all' && selectedStatus !== 'scheduled') return [];
    return pendingPackageSessions
      .filter(s => !!s.package)
      .filter(s => {
        if (selectedMonth === 'all') return true;
        if (!s.scheduled_date) return false;
        return filterByMonth(s.scheduled_date);
      })
      .sort((a, b) => {
        const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return (a.session_number || 0) - (b.session_number || 0);
      });
  }, [pendingPackageSessions, selectedMonth, selectedStatus]);

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

  // Calculate summary for filtered month (or all if 'all' selected)
  const summary = useMemo(() => {
    const completed = filteredAppointments.filter(a => a.status === 'completed');
    const totalValue = filteredPaymentHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalPending = 0;
    
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

      // Build a more descriptive refund description
      const refundDescription = `Devolução: ${selectedSale?.serviceName || 'Serviço'} - Cliente: ${clientName} - Pagamento: ${refundMethod || 'Não especificado'}`;

      if (openRegister) {
        await supabase.from('cash_transactions').insert({
          cash_register_id: openRegister.id,
          type: 'expense',
          category: 'refund',
          description: refundDescription,
          amount: refundAmount,
          reference_id: saleId,
          reference_type: 'refund',
          created_by: user?.id,
        });
      }

      // NOTE: NÃO criar financial_entry do tipo 'payable' aqui.
      // A devolução já está registrada como cash_transaction (saída) e aparece
      // corretamente no Extrato/Caixa. Criar como 'payable' fazia ela aparecer
      // indevidamente em "Contas a Pagar" como se fosse uma conta pendente.

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

  const paymentExportRows = filteredPaymentHistory.map(payment => [
    format(new Date(`${payment.date}T12:00:00`), 'dd/MM/yyyy'),
    payment.serviceName,
    payment.description || '-',
    `R$ ${Number(payment.totalPrice || 0).toFixed(2)}`,
    `R$ ${Number(payment.amount || 0).toFixed(2)}`,
    getPaymentMethodName(payment.paymentMethod),
    isClientCreditPaymentMethod(payment.paymentMethod) ? NON_CASH_PAYMENT_LABEL : 'Com entrada no caixa',
  ]);

  const exportToCSV = () => exportRowsToCSV({
    filename: `relatorio_pagamentos_${clientName.replace(/\s+/g, '_')}`,
    headers: ['Data pagamento', 'Serviço/Pacote', 'Descrição', 'Valor item', 'Pago', 'Forma', 'Caixa'],
    rows: paymentExportRows,
    successMessage: 'Relatório filtrado exportado em CSV!',
  });

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Relatório de Pagamentos - ${clientName}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Filtro: ${paymentTypeFilter === 'client_credit' ? CLIENT_CREDIT_SOURCE_LABEL : paymentTypeFilter === 'non_cash' ? NON_CASH_PAYMENT_LABEL : 'Todos pagamentos'} • Período: ${selectedMonth === 'all' ? 'Todos os meses' : format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: ptBR })}`, 14, 21);
    autoTable(doc, {
      startY: 28,
      head: [['Data pagamento', 'Serviço/Pacote', 'Descrição', 'Valor item', 'Pago', 'Forma', 'Caixa']],
      body: paymentExportRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 98, 255] },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 50 }, 2: { cellWidth: 76 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 28 } },
    });
    doc.save(`relatorio_pagamentos_${clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Filters Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
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
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos pagamentos</SelectItem>
              <SelectItem value="client_credit" className="text-xs">{CLIENT_CREDIT_SOURCE_LABEL}</SelectItem>
              <SelectItem value="non_cash" className="text-xs">{NON_CASH_PAYMENT_LABEL}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {filteredAppointments.length} agendamento(s)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualHeal}
            disabled={healingPackages || !resolvedClientIdEarly}
            className="h-8 text-xs"
            title="Vincular agendamentos órfãos a sessões de pacote e preencher serviços faltantes"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${healingPackages ? 'animate-spin' : ''}`} />
            Reparar pacotes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePurgeOrphans}
            disabled={purging || !resolvedClientIdEarly}
            className="h-8 text-xs text-destructive hover:text-destructive"
            title="Apagar permanentemente agendamentos órfãos de pacotes excluídos"
          >
            <Trash2 className={`h-3.5 w-3.5 mr-1 ${purging ? 'animate-pulse' : ''}`} />
            Limpar órfãos
          </Button>
          <Button size="sm" variant="outline" onClick={exportToCSV} disabled={filteredPaymentHistory.length === 0} className="h-8 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportToPDF} disabled={filteredPaymentHistory.length === 0} className="h-8 text-xs">
            <FileText className="h-3.5 w-3.5 mr-1" />
            PDF
          </Button>
        </div>

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

      {/* Payment History */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Histórico de Pagamentos Registrados</h3>
          {filteredPaymentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum pagamento registrado neste período</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] py-1.5 h-auto">Data pagamento</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto">Serviço/Pacote</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto text-right">Valor item</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto text-right">Pago</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto">Forma</TableHead>
                    <TableHead className="text-[10px] py-1.5 h-auto w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentHistory.map(payment => (
                    <TableRow key={payment.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs py-1.5 whitespace-nowrap">{format(new Date(`${payment.date}T12:00:00`), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-xs py-1.5 min-w-[180px]">
                        <div className="font-medium">{payment.serviceName}</div>
                        <div className="text-[10px] text-muted-foreground">{payment.description}</div>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right">R$ {Number(payment.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-semibold text-primary">R$ {Number(payment.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-xs py-1.5 whitespace-nowrap">
                        {getPaymentMethodName(payment.paymentMethod)}
                        {isClientCreditPaymentMethod(payment.paymentMethod) && (
                          <Badge variant="outline" className="ml-1 text-[10px]">{NON_CASH_PAYMENT_LABEL}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {/* Devolução removida — gerenciar pelo Financeiro > Pacotes */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Histórico Detalhado</h3>
          {filteredAppointments.length === 0 && filteredPendingSessions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum agendamento neste período</p>
            </div>
          ) : (
            <ScrollArea className="h-[460px] rounded border">
              <div className="min-w-[1180px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/40">
                    <TableHead className="text-[11px] py-2 h-auto min-w-[180px]">Serviço/Pacote</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap">Data</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap">Início</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap">Fim</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto min-w-[120px]">Profissional</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto">Sala</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto min-w-[140px]">Equipamento</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap">Aplicação</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto whitespace-nowrap min-w-[160px] text-center">Reagendar pacote</TableHead>
                    <TableHead className="text-[11px] py-2 h-auto text-right min-w-[90px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.map(appointment => {
                    const status = getAppointmentStatusConfig(appointment.status);
                    const packageData = appointment.package_appointment?.package;
                    const isPackage = Boolean(packageData);
                    const packageSession = appointment.package_appointment;
                    const serviceName = isPackage ? (appointment.service?.name || packageData?.service?.name || packageData?.name || '-') : (appointment.service?.name || '-');
                    const packageName = packageData?.name || null;
                    const professionalName = appointment.professional?.name || packageData?.professional?.name || appointment.service?.professional?.name || '-';
                    const roomName = appointment.room?.name || packageData?.room?.name || appointment.service?.room?.name || '-';
                    const equipmentList = appointment.service?.equipment?.length
                      ? appointment.service.equipment
                      : packageData?.equipment || [];
                    const equipmentNames = getEquipmentNames(equipmentList);
                    const packageId = packageData?.id;
                    const canReajust = Boolean(packageId && appointment.package_appointment?.session_number);
                    const applicationLabel = getPackageApplicationLabel(packageSession, packageData?.total_sessions, packageSequenceMap.get(appointment.id));
                    const recurringLabel = getAppointmentRecurringSessionLabel(recurringSequenceMap.get(appointment.id));

                    return (
                      <TableRow key={appointment.id} className="hover:bg-muted/30 align-top">
                        <TableCell className="text-xs py-2">
                          <div className="font-medium leading-tight">{serviceName}</div>
                          {packageName && <div className="text-[10px] text-primary font-medium leading-tight mt-0.5">Pacote: {packageName}</div>}
                        </TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap tabular-nums">{format(new Date(appointment.start_time), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap tabular-nums">{format(new Date(appointment.start_time), 'HH:mm')}</TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap tabular-nums">{format(new Date(appointment.end_time), 'HH:mm')}</TableCell>
                        <TableCell className="text-xs py-2">{professionalName}</TableCell>
                        <TableCell className="text-xs py-2">{roomName}</TableCell>
                        <TableCell className="text-xs py-2">{equipmentNames || '-'}</TableCell>
                        <TableCell className="py-2">
                          {packageSession || recurringLabel ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                              {packageSession ? applicationLabel : recurringLabel}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${status.className}`}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {canReajust ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] px-2 whitespace-nowrap mx-auto"
                              onClick={() => propagateSeriesDates.mutate({
                                appointment_id: appointment.id,
                                new_start_time: new Date(appointment.start_time),
                                new_end_time: new Date(appointment.end_time),
                                propagate_type: 'package',
                                package_id: packageId,
                                interval_days: packageData?.interval_days || undefined,
                              })}
                              disabled={propagateSeriesDates.isPending}
                            >
                              Reajustar seguintes
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex justify-end items-center gap-1 whitespace-nowrap">
                            {onEditAppointment && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditAppointment(appointment)} title="Editar">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Excluir"
                              onClick={() => {
                                if (window.confirm('Deseja apagar este agendamento? Esta ação não pode ser desfeita.')) {
                                  deleteAppointment.mutate(appointment.id);
                                }
                              }}
                              disabled={deleteAppointment.isPending || updateAppointment.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredPendingSessions.map(session => {
                    const pkg = session.package!;
                    const equipmentNames = getEquipmentNames(pkg.equipment || []);
                    const totalSessions = pkg.total_sessions || 0;
                    const seqNumber = session.session_number || session.sequence_order || 0;
                    const applicationLabel = totalSessions
                      ? `Aplicação ${seqNumber}/${totalSessions}`
                      : `Aplicação ${seqNumber}`;
                    return (
                      <TableRow key={`pending-${session.id}`} className="hover:bg-muted/30 align-top bg-amber-50/30 dark:bg-amber-950/10">
                        <TableCell className="text-xs py-2">
                          <div className="font-medium leading-tight">{pkg.service?.name || pkg.name || '-'}</div>
                          {pkg.name && <div className="text-[10px] text-primary font-medium leading-tight mt-0.5">Pacote: {pkg.name}</div>}
                        </TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                          {session.scheduled_date ? format(new Date(`${session.scheduled_date.split('T')[0]}T12:00:00`), 'dd/MM/yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap text-muted-foreground">—</TableCell>
                        <TableCell className="text-xs py-2 whitespace-nowrap text-muted-foreground">—</TableCell>
                        <TableCell className="text-xs py-2">{pkg.professional?.name || '-'}</TableCell>
                        <TableCell className="text-xs py-2">{pkg.room?.name || '-'}</TableCell>
                        <TableCell className="text-xs py-2">{equipmentNames || '-'}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">{applicationLabel}</Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap border-amber-400 text-amber-700 bg-amber-50">
                            A agendar
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span className="text-[10px] text-muted-foreground">—</span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex justify-end items-center gap-1 whitespace-nowrap">
                            <span className="text-[10px] text-muted-foreground">Agende pela Agenda</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
            </ScrollArea>
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