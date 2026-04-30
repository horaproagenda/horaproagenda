import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Briefcase, CheckCircle, Eye, WalletCards, Download, FileText, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClientServices } from '@/hooks/useClientServices';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils';
import { exportToCSV } from '@/lib/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAppointmentStatusConfig } from '@/lib/appointmentStatus';
import { getClientCreditTransactionTypeLabel } from '@/lib/clientCreditPayment';
import { buildPackageSessionSequenceMap, getPackageApplicationLabel, isPackageSessionRealized, sortPackageSessionsByChronologicalSequence } from '@/lib/packageSequence';

interface ClientCreditsTabProps {
  clientId: string;
}

interface PackageAppointmentDetail {
  id: string;
  package_id: string;
  session_number: number;
  original_session_number?: number;
  status: string;
  scheduled_date: string | null;
  appointment_id: string | null;
  created_at: string;
  appointment?: {
    start_time: string;
    end_time: string;
    status: string;
  } | null;
}

interface PackageWithCounts {
  id: string;
  name: string;
  total_sessions: number;
  total_price: number;
  sessions_scheduled: number;
  completedCount: number;
  scheduledCount: number;
  pendingCount: number;
}

interface ClientCreditTransaction {
  id: string;
  created_at: string;
  transaction_type: 'credit_added' | 'credit_used' | 'credit_adjustment';
  amount: number;
  previous_balance: number;
  new_balance: number;
  description: string;
  appointment_id?: string | null;
  sale_id?: string | null;
  professional_id?: string | null;
  professional?: { id: string; name: string } | null;
  appointment?: { start_time: string; service?: { name: string } | null } | null;
  sale?: { sale_date: string; service?: { name: string } | null; package?: { name: string } | null } | null;
}

const CREDIT_PAGE_SIZE = 25;

export function ClientCreditsTab({ clientId }: ClientCreditsTabProps) {
  const queryClient = useQueryClient();
  const { clientServices, isLoading: loadingServices } = useClientServices(clientId);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [creditSearch, setCreditSearch] = useState('');
  const [creditPage, setCreditPage] = useState(1);
  const [selectedCreditTransaction, setSelectedCreditTransaction] = useState<ClientCreditTransaction | null>(null);

  // Fetch client packages with accurate session counts from package_appointments
  const { data: clientPackages = [], isLoading: loadingPackages } = useQuery({
    queryKey: ['client_packages_with_counts', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      // First get the packages
      const { data: packages, error: packagesError } = await supabase
        .from('service_packages')
        .select('id, name, total_sessions, total_price, sessions_scheduled')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (packagesError) throw packagesError;
      if (!packages || packages.length === 0) return [];

      // For each package, get the actual counts from package_appointments
      const packagesWithCounts: PackageWithCounts[] = await Promise.all(
        packages.map(async (pkg) => {
          const { data: appointments, error: appError } = await supabase
            .from('package_appointments')
            .select('id, status, appointment_id, appointment:appointments!package_appointments_appointment_id_fkey(status)')
            .eq('package_id', pkg.id);

          if (appError) {
            console.error('Error fetching package appointments:', appError);
            return {
              ...pkg,
              completedCount: 0,
              scheduledCount: 0,
              pendingCount: pkg.total_sessions,
            };
          }

          // Count based on actual appointment status
          // Completed = appointment linked AND (appointment status is 'completed' OR package_appointment status is 'completed')
          const completedCount = (appointments || []).filter(a => {
            const aptStatus = (a.appointment as { status?: string } | null)?.status;
            return isPackageSessionRealized(aptStatus) || isPackageSessionRealized(a.status);
          }).length;
          
          // Scheduled = has appointment_id AND appointment is not completed/cancelled/missed
          // AND the appointment is scheduled, confirmed, or the package_appointment is scheduled
          const scheduledCount = (appointments || []).filter(a => {
            const aptStatus = (a.appointment as { status?: string } | null)?.status;
            // Must have an appointment linked
            if (!a.appointment_id) return false;
            // Must not be completed
            if (isPackageSessionRealized(aptStatus) || isPackageSessionRealized(a.status)) return false;
            // Must not be cancelled or missed
            if (aptStatus === 'cancelled' || aptStatus === 'missed') return false;
            // Is scheduled or confirmed
            return aptStatus === 'scheduled' || aptStatus === 'confirmed' || a.status === 'scheduled';
          }).length;
          
          // Pending = no appointment linked AND package_appointment status is 'pending'
          const pendingCount = (appointments || []).filter(a => {
            return a.status === 'pending' && !a.appointment_id;
          }).length;

          console.log(`Package ${pkg.name}: completed=${completedCount}, scheduled=${scheduledCount}, pending=${pendingCount}, total=${pkg.total_sessions}`);

          return {
            ...pkg,
            completedCount,
            scheduledCount,
            pendingCount,
          };
        })
      );

      return packagesWithCounts;
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`package-appointments-credits-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package_details'] });
        queryClient.invalidateQueries({ queryKey: ['client_packages_with_counts', clientId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package_details'] });
        queryClient.invalidateQueries({ queryKey: ['client_packages_with_counts', clientId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);

  const { data: packageDetails } = useQuery({
    queryKey: ['package_details', selectedPackageId],
    queryFn: async () => {
      if (!selectedPackageId) return null;
      
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`*, appointment:appointments!package_appointments_appointment_id_fkey(start_time, end_time, status)`)
        .eq('package_id', selectedPackageId)
        .order('session_number', { ascending: true });

      if (error) throw error;
      return sortPackageSessionsByChronologicalSequence((data || []) as any[]) as PackageAppointmentDetail[];
    },
    enabled: !!selectedPackageId,
    staleTime: 0,
  });

  const { data: creditTransactions = [] } = useQuery({
    queryKey: ['client_credit_transactions', clientId, creditSearch],
    queryFn: async () => {
      let query = (supabase as any)
        .from('client_credit_transactions')
        .select('id, created_at, transaction_type, amount, previous_balance, new_balance, description, appointment_id, sale_id, professional_id, professional:professionals(id, name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      const trimmedSearch = creditSearch.trim();
      if (trimmedSearch) {
        query = query.or(`description.ilike.%${trimmedSearch}%,transaction_type.ilike.%${trimmedSearch}%`);
      }

      const { data, error } = await query.range(0, CREDIT_PAGE_SIZE * creditPage - 1);

      if (error) throw error;
      const rows = (data || []) as ClientCreditTransaction[];
      const appointmentIds = rows.map(row => row.appointment_id).filter(Boolean) as string[];
      const saleIds = rows.map(row => row.sale_id).filter(Boolean) as string[];

      const [appointmentsResult, salesResult] = await Promise.all([
        appointmentIds.length
          ? supabase.from('appointments').select('id, start_time, service:services(name)').in('id', appointmentIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        saleIds.length
          ? supabase.from('single_sales').select('id, sale_date, service:services(name), package:service_packages(name)').in('id', saleIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (appointmentsResult.error) throw appointmentsResult.error;
      if (salesResult.error) throw salesResult.error;

      const appointmentMap = new Map((appointmentsResult.data || []).map((appointment: any) => [appointment.id, appointment]));
      const saleMap = new Map((salesResult.data || []).map((sale: any) => [sale.id, sale]));

      return rows.map(row => ({
        ...row,
        appointment: row.appointment_id ? appointmentMap.get(row.appointment_id) || null : null,
        sale: row.sale_id ? saleMap.get(row.sale_id) || null : null,
      })) as ClientCreditTransaction[];
    },
    enabled: !!clientId,
    staleTime: 0,
  });

  useEffect(() => {
    setCreditPage(1);
  }, [creditSearch, clientId]);

  const isLoading = loadingPackages || loadingServices;
  const packageSequenceMap = useMemo(
    () => buildPackageSessionSequenceMap((packageDetails || []) as any[]),
    [packageDetails]
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Calculate totals from actual package_appointment counts (pending = available)
  const totalPackageSessions = clientPackages.reduce((sum, pkg) => sum + pkg.pendingCount, 0);
  const availableServicesCount = clientServices.filter(s => s.status === 'available').length;
  const selectedPackage = clientPackages.find(p => p.id === selectedPackageId);

  // Calculate session counts correctly from packageDetails
  const completedSessions = packageDetails?.filter(s => {
    return isPackageSessionRealized(s.appointment?.status) || isPackageSessionRealized(s.status);
  }).length || 0;
  
  const scheduledSessions = packageDetails?.filter(s => {
    if (!s.appointment_id) return false;
    if (isPackageSessionRealized(s.appointment?.status) || isPackageSessionRealized(s.status)) return false;
    if (s.appointment?.status === 'cancelled') return false;
    return s.appointment?.status === 'scheduled' || s.appointment?.status === 'confirmed' || s.status === 'scheduled';
  }).length || 0;
  
  const pendingSessions = packageDetails?.filter(s => {
    return s.status === 'pending' && !s.appointment_id;
  }).length || 0;

  const buildCreditExportRows = (transactions: ClientCreditTransaction[]) => transactions.map(transaction => [
    format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    getClientCreditTransactionTypeLabel(transaction.transaction_type),
    transaction.description || '-',
    transaction.professional?.name || '-',
    formatCurrency(Number(transaction.amount || 0)),
    formatCurrency(Number(transaction.previous_balance || 0)),
    formatCurrency(Number(transaction.new_balance || 0)),
  ]);

  const fetchCreditTransactionsForExport = async () => {
    const pageSize = 1000;
    let from = 0;
    let allRows: ClientCreditTransaction[] = [];

    while (true) {
      let query = (supabase as any)
        .from('client_credit_transactions')
        .select('id, created_at, transaction_type, amount, previous_balance, new_balance, description, appointment_id, sale_id, professional_id, professional:professionals(id, name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      const trimmedSearch = creditSearch.trim();
      if (trimmedSearch) {
        query = query.or(`description.ilike.%${trimmedSearch}%,transaction_type.ilike.%${trimmedSearch}%`);
      }

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as ClientCreditTransaction[];
      allRows = [...allRows, ...rows];
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  };

  const exportCreditCSV = async () => {
    const rows = buildCreditExportRows(await fetchCreditTransactionsForExport());
    exportToCSV({
      filename: 'historico_credito_cliente',
      headers: ['Data', 'Tipo', 'Descrição', 'Profissional', 'Valor', 'Saldo anterior', 'Novo saldo'],
      rows,
      successMessage: 'Histórico de crédito exportado em CSV!',
    });
  };

  const exportCreditPDF = async () => {
    const creditExportRows = buildCreditExportRows(await fetchCreditTransactionsForExport());
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Histórico de Crédito ao Cliente', 14, 14);
    doc.setFontSize(9);
    doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 21);
    autoTable(doc, {
      startY: 28,
      head: [['Data', 'Tipo', 'Descrição', 'Profissional', 'Valor', 'Saldo anterior', 'Novo saldo']],
      body: creditExportRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 98, 255] },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 26 }, 2: { cellWidth: 70 }, 3: { cellWidth: 36 }, 4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 32 }, 6: { halign: 'right', cellWidth: 32 } },
    });
    doc.save(`historico_credito_cliente_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const getTransactionOrigin = (transaction: ClientCreditTransaction) => {
    if (transaction.appointment_id) return 'Atendimento';
    if (transaction.sale_id) return 'Venda/Documento';
    return 'Ajuste manual';
  };

  const getTransactionReference = (transaction: ClientCreditTransaction) => {
    if (transaction.appointment) {
      return `${transaction.appointment.service?.name || 'Atendimento'} • ${format(new Date(transaction.appointment.start_time), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`;
    }
    if (transaction.sale) {
      return `${transaction.sale.package?.name || transaction.sale.service?.name || 'Venda'} • ${format(new Date(`${transaction.sale.sale_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    if (transaction.appointment_id) return `Atendimento não localizado (${transaction.appointment_id})`;
    if (transaction.sale_id) return `Documento/venda não localizado (${transaction.sale_id})`;
    return 'Referência não vinculada';
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Summary Cards - Compact */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xl font-bold text-primary">{totalPackageSessions}</p>
                <p className="text-[10px] text-muted-foreground">Sessões Disponíveis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xl font-bold text-green-600">{availableServicesCount}</p>
                <p className="text-[10px] text-muted-foreground">Serviços Pagos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packages Section - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Package className="h-3.5 w-3.5" /> Pacotes
          </h3>
          {clientPackages.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum pacote</p>
          ) : (
            <div className="space-y-2">
              {clientPackages.map(pkg => {
                // Use actual counts: completed + scheduled = used, pendingCount = available
                const usedCount = pkg.completedCount + pkg.scheduledCount;
                const isComplete = pkg.pendingCount === 0;
                const progress = (usedCount / pkg.total_sessions) * 100;
                
                return (
                  <div
                    key={pkg.id}
                    className={`p-2.5 rounded-lg border ${isComplete ? 'bg-muted/30' : 'bg-primary/5 border-primary/20'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate">{pkg.name}</h4>
                        <p className="text-[10px] text-muted-foreground">
                          {pkg.completedCount} realizadas • {pkg.scheduledCount} agendadas • {pkg.pendingCount} disponíveis
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isComplete ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <CheckCircle className="h-2.5 w-2.5" /> Completo
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">
                            {pkg.pendingCount} disp.
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedPackageId(pkg.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${isComplete ? 'bg-muted-foreground' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Credit Balance History */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <WalletCards className="h-3.5 w-3.5" /> Histórico de Crédito ao Cliente
            </h3>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportCreditCSV} disabled={creditTransactions.length === 0}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportCreditPDF} disabled={creditTransactions.length === 0}>
                <FileText className="h-3 w-3 mr-1" /> PDF
              </Button>
            </div>
          </div>
          <div className="relative mb-2 max-w-sm">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={creditSearch}
              onChange={(event) => setCreditSearch(event.target.value)}
              placeholder="Buscar por tipo ou descrição..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          {creditTransactions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhuma movimentação de crédito registrada</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] py-1.5 h-auto">Data</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto">Tipo</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto">Descrição</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto">Profissional</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto text-right">Valor</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto text-right">Saldo anterior</TableHead>
                      <TableHead className="text-[10px] py-1.5 h-auto text-right">Novo saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditTransactions.map(transaction => (
                      <TableRow key={transaction.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedCreditTransaction(transaction)}>
                        <TableCell className="text-xs py-1.5 whitespace-nowrap">
                          {format(new Date(transaction.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 whitespace-nowrap">
                          <Badge variant={transaction.transaction_type === 'credit_used' ? 'secondary' : 'outline'} className="text-[10px]">
                            {getClientCreditTransactionTypeLabel(transaction.transaction_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 min-w-[220px]">{transaction.description}</TableCell>
                        <TableCell className="text-xs py-1.5 whitespace-nowrap">{transaction.professional?.name || '-'}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-medium">{formatCurrency(Number(transaction.amount || 0))}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right">{formatCurrency(Number(transaction.previous_balance || 0))}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-semibold text-primary">{formatCurrency(Number(transaction.new_balance || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
              {creditTransactions.length >= CREDIT_PAGE_SIZE * creditPage && (
                <div className="mt-2 flex justify-center">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreditPage(page => page + 1)}>
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Services Section - Compact */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" /> Serviços Pagos
          </h3>
          {clientServices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum serviço pago</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {clientServices.map(service => {
                const isAvailable = service.status === 'available';
                const isUsed = service.status === 'used';
                const isCancelled = service.status === 'expired' && service.notes?.includes('CANCELADO');
                const isAwaitingSchedule = service.status === 'available' && !service.appointment_id;
                
                return (
                  <div
                    key={service.id}
                    className={`p-2 rounded-lg border text-xs ${
                      isCancelled ? 'bg-destructive/5 border-destructive/20' :
                      isUsed ? 'bg-muted/30' :
                      isAwaitingSchedule ? 'bg-orange-500/5 border-orange-500/20' :
                      'bg-green-500/5 border-green-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{service.service?.name || 'Serviço'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground">{formatCurrency(Number(service.amount_paid))}</span>
                        {isCancelled ? (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">Canc.</Badge>
                        ) : isAwaitingSchedule ? (
                          <Badge className="bg-orange-500 text-white text-[10px] px-1 py-0">Aguard.</Badge>
                        ) : isAvailable ? (
                          <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">Disp.</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">Usado</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCreditTransaction} onOpenChange={(open) => !open && setSelectedCreditTransaction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <WalletCards className="h-4 w-4" /> Detalhes da transação
            </DialogTitle>
          </DialogHeader>
          {selectedCreditTransaction && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2">
                  <p className="text-[10px] text-muted-foreground">Saldo anterior</p>
                  <p className="font-semibold">{formatCurrency(Number(selectedCreditTransaction.previous_balance || 0))}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[10px] text-muted-foreground">Novo saldo</p>
                  <p className="font-semibold text-primary">{formatCurrency(Number(selectedCreditTransaction.new_balance || 0))}</p>
                </div>
              </div>
              <div className="rounded-md border p-2 space-y-1">
                <p><span className="text-muted-foreground">Data:</span> {format(new Date(selectedCreditTransaction.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                <p><span className="text-muted-foreground">Tipo:</span> {getClientCreditTransactionTypeLabel(selectedCreditTransaction.transaction_type)}</p>
                <p><span className="text-muted-foreground">Valor:</span> {formatCurrency(Number(selectedCreditTransaction.amount || 0))}</p>
                <p><span className="text-muted-foreground">Profissional responsável:</span> {selectedCreditTransaction.professional?.name || '— (não registrado)'}</p>
                <p><span className="text-muted-foreground">Origem:</span> {getTransactionOrigin(selectedCreditTransaction)}</p>
                <p><span className="text-muted-foreground">Referência do documento/atendimento:</span> {getTransactionReference(selectedCreditTransaction)}</p>
                <p><span className="text-muted-foreground">Descrição:</span> {selectedCreditTransaction.description}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Package Details Dialog */}
      <Dialog open={!!selectedPackageId} onOpenChange={(open) => !open && setSelectedPackageId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> {selectedPackage?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {/* Mini Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 bg-green-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-green-600">{completedSessions}</p>
                <p className="text-[10px] text-muted-foreground">Realizadas</p>
              </div>
              <div className="p-2 bg-blue-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-blue-600">{scheduledSessions}</p>
                <p className="text-[10px] text-muted-foreground">Agendadas</p>
              </div>
              <div className="p-2 bg-orange-500/5 rounded-lg text-center">
                <p className="text-lg font-bold text-orange-600">{pendingSessions}</p>
                <p className="text-[10px] text-muted-foreground">Restantes</p>
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
              {packageDetails?.map((session) => {
                const effectiveStatus = session.appointment?.status || session.status;
                const status = getAppointmentStatusConfig(effectiveStatus);
                const isCompleted = isPackageSessionRealized(effectiveStatus);
                const isCancelled = effectiveStatus === 'cancelled';
                const isScheduled = session.appointment_id && !isCompleted && !isCancelled;
                
                const getStatusColor = () => {
                  if (isCompleted) return 'bg-green-500/5 border-green-500/20';
                  if (isCancelled) return 'bg-red-500/5 border-red-500/20';
                  if (isScheduled) return 'bg-blue-500/5 border-blue-500/20';
                  return 'bg-orange-500/5 border-orange-500/20';
                };
                
                return (
                  <div key={session.id} className={`p-2 rounded-lg border flex items-center justify-between ${getStatusColor()}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {getPackageApplicationLabel(session as any, selectedPackage?.total_sessions, packageSequenceMap.get(session.id))}
                      </span>
                      {session.appointment && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(session.appointment.start_time), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <Badge 
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${status.className}`}
                    >
                      {session.status === 'pending' && !session.appointment_id ? 'Pendente' : status.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
