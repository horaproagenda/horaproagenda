import { useMemo, useState, useEffect } from 'react';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
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
import { 
  Users, 
  DollarSign, 
  Percent, 
  TrendingUp,
  Download,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useBanks } from '@/hooks/useBanks';
import { supabase } from '@/integrations/supabase/client';
import type { Appointment, Professional } from '@/types';

interface CommissionsReportProps {
  appointments: Appointment[];
  professionals: Professional[];
  dateRange: { start: Date; end: Date };
  dateRangeLabel: string;
}

interface ProfessionalCommission {
  professional: Professional;
  totalServices: number;
  totalRevenue: number;
  commissionPercentage: number;
  commissionValue: number;
  appointments: Appointment[];
  isPaid?: boolean;
  paidAt?: string;
}

export function CommissionsReport({
  appointments,
  professionals,
  dateRange,
  dateRangeLabel,
}: CommissionsReportProps) {
  const { createEntry, entries } = useFinancialEntries();
  const { activePaymentMethods } = usePaymentMethods();
  const { banks } = useBanks();
  
  const queryClient = useQueryClient();
  
  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<ProfessionalCommission | null>(null);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentTime, setPaymentTime] = useState(format(new Date(), 'HH:mm'));
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [bankId, setBankId] = useState<string>('');

  // Fetch per-service commission overrides (real-time)
  const { data: serviceCommissions = [] } = useQuery({
    queryKey: ['professional_service_commissions_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_service_commissions' as any)
        .select('*');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 2000,
    staleTime: 0,
  });

  // Force commissions to refresh every 1s by invalidating source data
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['professional_service_commissions_all'] });
    }, 1000);
    return () => clearInterval(id);
  }, [queryClient]);

  // Realtime subscriptions for commissions related tables
  useEffect(() => {
    const ch = supabase
      .channel('commissions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professional_service_commissions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['professional_service_commissions_all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['professionals'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Check if a commission was already paid
  const paidCommissions = useMemo(() => {
    const periodKey = `${format(dateRange.start, 'yyyy-MM')}-${format(dateRange.end, 'yyyy-MM')}`;
    return entries
      .filter(e => 
        e.type === 'payable' && 
        e.status === 'paid' &&
        e.description.includes('Comissão -') &&
        e.description.includes(periodKey)
      )
      .map(e => {
        // Extract professional name from description
        const match = e.description.match(/Comissão - (.+?) -/);
        return {
          professionalName: match ? match[1] : '',
          paidAt: e.paid_date,
          entryId: e.id,
        };
      });
  }, [entries, dateRange]);

  // Calculate commissions by professional
  const commissionsData = useMemo(() => {
    const professionalsMap: Record<string, ProfessionalCommission> = {};

    // Filter paid appointments within the date range
    const filteredAppointments = appointments.filter(apt => {
      if (apt.payment_status !== 'paid' || !apt.amount_paid || apt.amount_paid <= 0) {
        return false;
      }
      const aptDate = parseISO(apt.updated_at);
      return isWithinInterval(aptDate, dateRange);
    });

    // Group by professional
    filteredAppointments.forEach(apt => {
      const profId = apt.professional_id || apt.service?.professional_id;
      if (!profId) return;

      const professional = professionals.find(p => p.id === profId);
      if (!professional) return;

      if (!professionalsMap[profId]) {
        const paidInfo = paidCommissions.find(pc => pc.professionalName === professional.name);
        professionalsMap[profId] = {
          professional,
          totalServices: 0,
          totalRevenue: 0,
          commissionPercentage: professional.commission_percentage || 0,
          commissionValue: 0,
          appointments: [],
          isPaid: !!paidInfo,
          paidAt: paidInfo?.paidAt || undefined,
        };
      }

      professionalsMap[profId].totalServices += 1;
      professionalsMap[profId].totalRevenue += apt.amount_paid || 0;
      professionalsMap[profId].appointments.push(apt);
    });

    // Calculate commissions - with per-service overrides
    Object.values(professionalsMap).forEach(data => {
      if (!data.professional.is_commission_based) return;
      const prof = data.professional;
      const profType = (prof as any).commission_type || 'percentage';
      
      let totalCommission = 0;
      data.appointments.forEach(apt => {
        const amount = apt.amount_paid || 0;
        const serviceId = apt.service_id;
        
        // Check for per-service override
        const override = serviceId ? serviceCommissions.find(
          (sc: any) => sc.professional_id === prof.id && sc.service_id === serviceId
        ) : null;

        if (override) {
          if (override.commission_type === 'fixed') {
            totalCommission += Number(override.commission_fixed_value) || 0;
          } else {
            totalCommission += (amount * (Number(override.commission_percentage) || 0)) / 100;
          }
        } else if (profType === 'fixed') {
          totalCommission += Number((prof as any).commission_fixed_value) || 0;
        } else {
          totalCommission += (amount * (data.commissionPercentage || 0)) / 100;
        }
      });
      
      data.commissionValue = totalCommission;
    });

    return Object.values(professionalsMap).sort((a, b) => b.commissionValue - a.commissionValue);
  }, [appointments, professionals, dateRange, paidCommissions, serviceCommissions]);

  // Calculate totals
  const totals = useMemo(() => {
    return commissionsData.reduce(
      (acc, data) => ({
        totalServices: acc.totalServices + data.totalServices,
        totalRevenue: acc.totalRevenue + data.totalRevenue,
        totalCommissions: acc.totalCommissions + data.commissionValue,
        paidCommissions: acc.paidCommissions + (data.isPaid ? data.commissionValue : 0),
        pendingCommissions: acc.pendingCommissions + (data.isPaid ? 0 : data.commissionValue),
      }),
      { totalServices: 0, totalRevenue: 0, totalCommissions: 0, paidCommissions: 0, pendingCommissions: 0 }
    );
  }, [commissionsData]);

  const handleOpenPaymentDialog = (data: ProfessionalCommission) => {
    setSelectedCommission(data);
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setPaymentTime(format(new Date(), 'HH:mm'));
    setPaymentMethodId('');
    setBankId('');
    setPaymentDialogOpen(true);
  };

  const handlePayCommission = async () => {
    if (!selectedCommission || !paymentMethodId) {
      toast.error('Selecione a forma de pagamento');
      return;
    }

    const periodKey = `${format(dateRange.start, 'yyyy-MM')}-${format(dateRange.end, 'yyyy-MM')}`;
    const paidDateTime = `${paymentDate}T${paymentTime}:00`;

    try {
      await createEntry.mutateAsync({
        type: 'payable',
        description: `Comissão - ${selectedCommission.professional.name} - ${periodKey}`,
        amount: selectedCommission.commissionValue,
        due_date: paymentDate,
        paid_date: paymentDate,
        status: 'paid',
        payment_method_id: paymentMethodId,
        bank_id: bankId || null,
        professional_id: selectedCommission.professional.id,
        notes: `Pagamento realizado em ${format(parseISO(paidDateTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. ${selectedCommission.totalServices} atendimentos, receita total: R$ ${selectedCommission.totalRevenue.toFixed(2)}`,
        is_recurring: false,
        recurring_day: null,
        recurring_count: null,
        recurring_frequency: null,
        installments: 1,
        paid_by: null,
        client_id: null,
        appointment_id: null,
        category_id: null,
      });

      toast.success(`Comissão de ${selectedCommission.professional.name} paga com sucesso!`);
      setPaymentDialogOpen(false);
    } catch (error) {
      console.error('Error paying commission:', error);
    }
  };

  const exportCommissionsReport = () => {
    const csvContent = [
      ['Profissional', 'Atendimentos', 'Receita Total', '% Comissão', 'Valor Comissão'].join(';'),
      ...commissionsData.map(data => [
        data.professional.name,
        data.totalServices.toString(),
        `R$ ${data.totalRevenue.toFixed(2)}`,
        `${data.commissionPercentage}%`,
        `R$ ${data.commissionValue.toFixed(2)}`,
      ].join(';')),
      ['', '', '', '', ''].join(';'),
      ['TOTAL', totals.totalServices.toString(), `R$ ${totals.totalRevenue.toFixed(2)}`, '', `R$ ${totals.totalCommissions.toFixed(2)}`].join(';'),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-comissoes-${format(dateRange.start, 'dd-MM-yyyy')}-a-${format(dateRange.end, 'dd-MM-yyyy')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório de comissões exportado!');
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards — gradientes sutis e tipografia padronizada */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Profissionais</p>
                <p className="text-lg font-bold text-primary mt-0.5">{commissionsData.length}</p>
              </div>
              <Users className="h-7 w-7 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/5 to-transparent shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Atendimentos</p>
                <p className="text-lg font-bold text-blue-600 mt-0.5">{totals.totalServices}</p>
              </div>
              <Calendar className="h-7 w-7 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Receita Total</p>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">
                  R$ {totals.totalRevenue.toFixed(2)}
                </p>
              </div>
              <DollarSign className="h-7 w-7 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/5 to-transparent shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Comissões</p>
                <p className="text-lg font-bold text-amber-600 mt-0.5">
                  R$ {totals.totalCommissions.toFixed(2)}
                </p>
              </div>
              <TrendingUp className="h-7 w-7 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commission Details */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              Comissões por Profissional - {dateRangeLabel}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={exportCommissionsReport}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {commissionsData.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum atendimento pago no período selecionado</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Accordion type="multiple" className="space-y-2">
                {commissionsData.map(data => {
                  const profColor = data.professional.agenda_color || 'hsl(var(--primary))';
                  return (
                  <AccordionItem
                    key={data.professional.id}
                    value={data.professional.id}
                    className="border rounded-lg px-4 border-l-4 shadow-sm hover:shadow-md transition-all"
                    style={{ borderLeftColor: profColor, background: `linear-gradient(to right, ${profColor}08, transparent 30%)` }}
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full ring-2 ring-offset-1"
                            style={{ backgroundColor: profColor, '--tw-ring-color': `${profColor}40` } as any}
                          />
                          <div className="text-left">
                            <p className="font-semibold text-sm" style={{ color: profColor }}>{data.professional.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {data.totalServices} atendimento{data.totalServices !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Receita</p>
                            <p className="text-sm font-semibold text-emerald-600">R$ {data.totalRevenue.toFixed(2)}</p>
                          </div>
                          {data.professional.is_commission_based ? (
                            <div className="text-right min-w-[100px]">
                              <div className="flex items-center gap-1.5 justify-end mb-1">
                                <Badge variant="secondary" className="text-[10px] h-5">
                                  {data.commissionPercentage}%
                                </Badge>
                                {data.isPaid && (
                                  <Badge variant="outline" className="text-[10px] h-5 text-emerald-600 border-emerald-300 bg-emerald-50">
                                    <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                    Pago
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-bold text-amber-600">
                                R$ {data.commissionValue.toFixed(2)}
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Sem comissão
                            </Badge>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-2 pb-4">
                        <Table>
                          <TableHeader>
                            <TableRow style={{ borderBottomColor: `${profColor}40` }}>
                              <TableHead className="w-[110px] text-[11px]">Data</TableHead>
                              <TableHead className="text-[11px]">Cliente</TableHead>
                              <TableHead className="text-[11px]">Serviço</TableHead>
                              <TableHead className="text-right text-[11px]">Valor</TableHead>
                              <TableHead className="text-right text-[11px]">Comissão</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.appointments.map(apt => {
                              const aptCommission = data.professional.is_commission_based
                                ? ((apt.amount_paid || 0) * data.commissionPercentage) / 100
                                : 0;
                              return (
                                <TableRow key={apt.id} className="hover:bg-muted/40 transition-colors">
                                  <TableCell className="text-xs py-2 text-muted-foreground tabular-nums">
                                    {format(parseISO(apt.start_time), 'dd/MM/yy HH:mm', { locale: ptBR })}
                                  </TableCell>
                                  <TableCell className="text-xs py-2 font-medium">
                                    {apt.client?.name || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs py-2">
                                    {apt.service?.name || '-'}
                                  </TableCell>
                                  <TableCell className="text-right text-xs py-2 font-medium tabular-nums">
                                    R$ {(apt.amount_paid || 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right text-xs py-2 font-semibold text-amber-600 tabular-nums">
                                    R$ {aptCommission.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        
                        {/* Payment button for commission-based professionals */}
                        {data.professional.is_commission_based && data.commissionValue > 0 && (
                          <div className="flex items-center justify-between pt-4 border-t mt-4">
                            <div>
                              {data.isPaid ? (
                                <p className="text-xs text-emerald-600 flex items-center gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Comissão paga em {data.paidAt ? format(parseISO(data.paidAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Comissão pendente de pagamento
                                </p>
                              )}
                            </div>
                            {!data.isPaid && (
                              <Button 
                                size="sm" 
                                onClick={() => handleOpenPaymentDialog(data)}
                                className="text-xs h-8 shadow-sm"
                                style={{ backgroundColor: profColor, color: 'white' }}
                              >
                                <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                                Pagar Comissão
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar Comissão</DialogTitle>
          </DialogHeader>
          
          {selectedCommission && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedCommission.professional.agenda_color || '#3B82F6' }}
                  />
                  <p className="font-medium">{selectedCommission.professional.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="text-muted-foreground">Atendimentos:</p>
                  <p className="font-medium">{selectedCommission.totalServices}</p>
                  <p className="text-muted-foreground">Receita:</p>
                  <p className="font-medium">R$ {selectedCommission.totalRevenue.toFixed(2)}</p>
                  <p className="text-muted-foreground">Comissão ({selectedCommission.commissionPercentage}%):</p>
                  <p className="font-bold text-green-600">R$ {selectedCommission.commissionValue.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={paymentTime}
                    onChange={(e) => setPaymentTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Forma de Pagamento *</Label>
                <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePaymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Conta Bancária (opcional)</Label>
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta bancária" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.filter(b => b.is_active).map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePayCommission} disabled={createEntry.isPending}>
              {createEntry.isPending ? 'Pagando...' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
