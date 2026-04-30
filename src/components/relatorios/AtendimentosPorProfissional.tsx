import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, DollarSign, Percent, Calendar, Download, ChevronRight, CheckCircle, CalendarIcon, X } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionals } from '@/hooks/useProfessionals';
import { exportToCSV } from '@/lib/exportUtils';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function AtendimentosPorProfissional() {
  const { professionals } = useProfessionals();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [detailDateFrom, setDetailDateFrom] = useState<Date | undefined>(undefined);
  const [detailDateTo, setDetailDateTo] = useState<Date | undefined>(undefined);

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel('atend_prof_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () =>
        queryClient.invalidateQueries({ queryKey: ['atend_prof_data'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () =>
        queryClient.invalidateQueries({ queryKey: ['atend_prof_data'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () =>
        queryClient.invalidateQueries({ queryKey: ['atend_prof_data'] })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () =>
        queryClient.invalidateQueries({ queryKey: ['atend_prof_data'] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Fetch all appointments with details (last 12 months)
  const { data: allAppointments = [], isLoading } = useQuery({
    queryKey: ['atend_prof_data'],
    queryFn: async () => {
      const from = startOfMonth(subMonths(new Date(), 11));
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, start_time, amount_paid, payment_status, status,
          professional_id,
          client:clients(id, name),
          service:services(id, name, price, commission_percentage)
        `)
        .gte('start_time', from.toISOString())
        .in('status', ['completed', 'confirmed', 'scheduled'])
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
  });

  // Commission payments from financial_entries
  const { data: commissionPayments = [] } = useQuery({
    queryKey: ['atend_prof_commission_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .ilike('description', '%comissão%')
        .eq('type', 'expense')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
  });

  // Build summary per professional
  const profSummaries = useMemo(() => {
    const activeProfessionals = professionals.filter(p => p.is_active);
    return activeProfessionals
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .map(prof => {
        const profAppts = allAppointments.filter((a: any) => a.professional_id === prof.id && a.status === 'completed');
        const totalServices = profAppts.length;
        const totalRevenue = profAppts.reduce((s: number, a: any) =>
          s + (Number(a.amount_paid) || Number(a.service?.price) || 0), 0);
        const totalCommission = profAppts.reduce((s: number, a: any) => {
          const amt = Number(a.amount_paid) || Number(a.service?.price) || 0;
          const pct = Number(a.service?.commission_percentage || prof.commission_percentage || 0);
          return s + (amt * pct / 100);
        }, 0);

        // Check commission payments for this professional
        const paidCommissions = commissionPayments.filter((cp: any) =>
          cp.description?.includes(prof.name)
        );
        const totalPaidCommissions = paidCommissions.reduce((s: number, cp: any) => s + Number(cp.amount || 0), 0);

        return {
          professional: prof,
          totalServices,
          totalRevenue,
          totalCommission,
          totalPaidCommissions,
          paidCommissions,
          appointments: profAppts,
        };
      })
      .sort((a, b) => b.totalServices - a.totalServices);
  }, [professionals, allAppointments, commissionPayments, search]);

  // Get monthly breakdown for selected professional
  const monthlyBreakdown = useMemo(() => {
    if (!selectedProfessional) return [];
    let profAppts = allAppointments.filter((a: any) =>
      a.professional_id === selectedProfessional && a.status === 'completed'
    );

    // Apply date range filter
    if (detailDateFrom) {
      profAppts = profAppts.filter((a: any) => parseISO(a.start_time) >= detailDateFrom);
    }
    if (detailDateTo) {
      const endOfDay = new Date(detailDateTo);
      endOfDay.setHours(23, 59, 59, 999);
      profAppts = profAppts.filter((a: any) => parseISO(a.start_time) <= endOfDay);
    }

    const months: { month: Date; label: string; appointments: any[] }[] = [];
    for (let i = 0; i < 12; i++) {
      const monthDate = subMonths(new Date(), i);
      const mStart = startOfMonth(monthDate);
      const mEnd = endOfMonth(monthDate);
      const monthAppts = profAppts.filter((a: any) => {
        const d = parseISO(a.start_time);
        return isWithinInterval(d, { start: mStart, end: mEnd });
      });
      if (monthAppts.length > 0 || i === 0) {
        months.push({
          month: monthDate,
          label: format(monthDate, 'MMMM yyyy', { locale: ptBR }),
          appointments: monthAppts,
        });
      }
    }
    return months;
  }, [selectedProfessional, allAppointments, detailDateFrom, detailDateTo]);

  const selectedProf = professionals.find(p => p.id === selectedProfessional);
  const selectedProfPaidCommissions = commissionPayments.filter((cp: any) =>
    selectedProf && cp.description?.includes(selectedProf.name)
  );

  const handleExport = () => {
    const rows = profSummaries.map(p => [
      p.professional.name,
      p.totalServices,
      p.totalRevenue,
      p.totalCommission,
      p.totalPaidCommissions,
    ]);
    exportToCSV({
      filename: 'atendimentos_por_profissional',
      headers: ['Profissional', 'Atendimentos', 'Receita Total', 'Total Comissões', 'Comissões Pagas'],
      rows,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Input
          placeholder="Buscar profissional..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Profissionais</p>
            <p className="text-xl font-bold text-primary">{profSummaries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Atendimentos</p>
            <p className="text-xl font-bold">
              {profSummaries.reduce((s, p) => s + p.totalServices, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Receita Total</p>
            <p className="text-lg font-bold text-emerald-600">
              {formatCurrency(profSummaries.reduce((s, p) => s + p.totalRevenue, 0))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Comissões</p>
            <p className="text-lg font-bold text-blue-600">
              {formatCurrency(profSummaries.reduce((s, p) => s + p.totalCommission, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Professional list */}
      <div className="space-y-2">
        {profSummaries.map(item => (
          <Card
            key={item.professional.id}
            className="card-hover cursor-pointer transition-all"
            onClick={() => setSelectedProfessional(item.professional.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {item.professional.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{item.professional.name}</h3>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.totalServices} atend.
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(item.totalRevenue)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Percent className="h-3 w-3" />
                      {formatCurrency(item.totalCommission)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.totalPaidCommissions > 0 && (
                    <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {formatCurrency(item.totalPaidCommissions)} pago
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {profSummaries.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">Nenhum profissional encontrado</p>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selectedProfessional} onOpenChange={(open) => { if (!open) setSelectedProfessional(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Atendimentos - {selectedProf?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-2 py-2 border-b">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {detailDateFrom ? format(detailDateFrom, 'dd/MM/yyyy') : 'Data início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={detailDateFrom}
                  onSelect={setDetailDateFrom}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {detailDateTo ? format(detailDateTo, 'dd/MM/yyyy') : 'Data fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={detailDateTo}
                  onSelect={setDetailDateTo}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {(detailDateFrom || detailDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground"
                onClick={() => { setDetailDateFrom(undefined); setDetailDateTo(undefined); }}
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {/* Commission payments history */}
              {selectedProfPaidCommissions.length > 0 && (
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Histórico de Pagamentos de Comissões
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Valor</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedProfPaidCommissions.map((cp: any) => (
                          <TableRow key={cp.id}>
                            <TableCell className="text-xs">
                              {cp.created_at ? format(parseISO(cp.created_at), 'dd/MM/yyyy HH:mm') : '-'}
                            </TableCell>
                            <TableCell className="text-xs font-medium text-emerald-700">
                              {formatCurrency(Number(cp.amount || 0))}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{cp.description}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Monthly breakdown */}
              <Accordion type="multiple" defaultValue={monthlyBreakdown.length > 0 ? [monthlyBreakdown[0].label] : []}>
                {monthlyBreakdown.map(month => {
                  const prof = selectedProf;
                  const monthRevenue = month.appointments.reduce((s: number, a: any) =>
                    s + (Number(a.amount_paid) || Number(a.service?.price) || 0), 0);
                  const monthCommission = month.appointments.reduce((s: number, a: any) => {
                    const amt = Number(a.amount_paid) || Number(a.service?.price) || 0;
                    const pct = Number(a.service?.commission_percentage || prof?.commission_percentage || 0);
                    return s + (amt * pct / 100);
                  }, 0);

                  return (
                    <AccordionItem key={month.label} value={month.label}>
                      <AccordionTrigger className="text-sm hover:no-underline py-2">
                        <div className="flex items-center gap-3 w-full pr-4">
                          <span className="capitalize font-medium">{month.label}</span>
                          <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px]">
                              {month.appointments.length} atend.
                            </Badge>
                            <span>{formatCurrency(monthRevenue)}</span>
                            <span className="text-blue-600">{formatCurrency(monthCommission)}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Data</TableHead>
                              <TableHead className="text-xs">Cliente</TableHead>
                              <TableHead className="text-xs">Serviço</TableHead>
                              <TableHead className="text-xs text-right">Valor</TableHead>
                              <TableHead className="text-xs text-right">Comissão</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {month.appointments.map((apt: any) => {
                              const amt = Number(apt.amount_paid) || Number(apt.service?.price) || 0;
                              const pct = Number(apt.service?.commission_percentage || prof?.commission_percentage || 0);
                              const comm = amt * pct / 100;
                              return (
                                <TableRow key={apt.id}>
                                  <TableCell className="text-xs">
                                    {format(parseISO(apt.start_time), 'dd/MM/yyyy')}
                                  </TableCell>
                                  <TableCell className="text-xs">{apt.client?.name || '-'}</TableCell>
                                  <TableCell className="text-xs">{apt.service?.name || '-'}</TableCell>
                                  <TableCell className="text-xs text-right">{formatCurrency(amt)}</TableCell>
                                  <TableCell className="text-xs text-right text-blue-600">
                                    {formatCurrency(comm)} ({pct}%)
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {monthlyBreakdown.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhum atendimento encontrado para este profissional
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
