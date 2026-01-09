import { useState, useMemo, useEffect } from 'react';
import { Cake, RotateCcw, UserX, Phone, Mail, Calendar, Sparkles, Package, TrendingUp, DollarSign, Check, Clock, AlertTriangle, Download, Filter, X } from 'lucide-react';
import { format, differenceInDays, parseISO, isSameMonth, isSameDay, addDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { exportToCSV } from '@/lib/exportUtils';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const Relatorios = () => {
  const [activeTab, setActiveTab] = useLocalStorage('relatorios-tab', 'aniversariantes');
  const [searchTerm, setSearchTerm] = useLocalStorage('relatorios-search', '');
  const { clients, isLoading: clientsLoading } = useClients();
  const { appointments, isLoading: appointmentsLoading } = useAppointments();
  const { packages, isLoading: packagesLoading } = useServicePackages();
  const { professionals } = useProfessionals();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Realtime sync for reports
  useEffect(() => {
    const channel = supabase
      .channel('reports_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_packages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['professionals'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  // Aniversariantes do mês
  const aniversariantes = useMemo(() => {
    const activeClients = clients.filter(c => c.is_active);
    const activeProfessionals = professionals.filter(p => p.is_active);
    
    const clientBirthdays = activeClients
      .filter(client => {
        if (!client.birthdate) return false;
        const birthDate = parseISO(client.birthdate);
        return birthDate.getMonth() === currentMonth;
      })
      .map(client => {
        const birthDate = parseISO(client.birthdate!);
        const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        let daysUntil = differenceInDays(thisYearBirthday, today);
        const isToday = birthDate.getDate() === currentDay && birthDate.getMonth() === currentMonth;
        const isPast = birthDate.getDate() < currentDay;
        return { 
          ...client, 
          birthDate, 
          daysUntil: isPast ? birthDate.getDate() - currentDay : daysUntil, 
          isToday,
          isPast,
          type: 'client' as const 
        };
      });

    const professionalBirthdays = activeProfessionals
      .filter(prof => {
        if (!prof.birthdate) return false;
        const birthDate = parseISO(prof.birthdate);
        return birthDate.getMonth() === currentMonth;
      })
      .map(prof => {
        const birthDate = parseISO(prof.birthdate!);
        const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        let daysUntil = differenceInDays(thisYearBirthday, today);
        const isToday = birthDate.getDate() === currentDay && birthDate.getMonth() === currentMonth;
        const isPast = birthDate.getDate() < currentDay;
        return { 
          id: prof.id,
          name: prof.name, 
          phone: prof.phone || '',
          email: prof.email,
          birthDate, 
          daysUntil: isPast ? birthDate.getDate() - currentDay : daysUntil, 
          isToday,
          isPast,
          type: 'professional' as const 
        };
      });

    return [...clientBirthdays, ...professionalBirthdays]
      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (a.isToday && !b.isToday) return -1;
        if (!a.isToday && b.isToday) return 1;
        if (!a.isPast && b.isPast) return -1;
        if (a.isPast && !b.isPast) return 1;
        return a.daysUntil - b.daysUntil;
      });
  }, [clients, professionals, today, currentMonth, currentDay, searchTerm]);

  // Clientes para retorno
  const retornos = useMemo(() => {
    const clientLastAppointments = new Map<string, { date: Date; serviceName: string; returnDays: number }>();
    
    appointments
      .filter(apt => apt.status === 'completed' && apt.service?.return_days && apt.service.return_days > 0)
      .forEach(apt => {
        const aptDate = parseISO(apt.start_time);
        const current = clientLastAppointments.get(apt.client_id);
        if (!current || aptDate > current.date) {
          clientLastAppointments.set(apt.client_id, {
            date: aptDate,
            serviceName: apt.service?.name || 'Serviço',
            returnDays: apt.service?.return_days || 30
          });
        }
      });

    return clients
      .filter(client => {
        if (!client.is_active) return false;
        const lastAppt = clientLastAppointments.get(client.id);
        if (!lastAppt) return false;
        const daysSinceVisit = differenceInDays(today, lastAppt.date);
        return daysSinceVisit >= lastAppt.returnDays && daysSinceVisit < lastAppt.returnDays * 3;
      })
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(client => {
        const lastAppt = clientLastAppointments.get(client.id)!;
        const daysSinceVisit = differenceInDays(today, lastAppt.date);
        const daysOverdue = daysSinceVisit - lastAppt.returnDays;
        return {
          ...client,
          lastVisit: lastAppt.date,
          daysSinceVisit,
          serviceName: lastAppt.serviceName,
          returnDays: lastAppt.returnDays,
          daysOverdue
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [clients, appointments, today, searchTerm]);

  // Clientes sumidos
  const sumidos = useMemo(() => {
    const clientLastAppointments = new Map<string, { date: Date; serviceName: string }>();
    
    appointments
      .filter(apt => apt.status === 'completed')
      .forEach(apt => {
        const aptDate = parseISO(apt.start_time);
        const current = clientLastAppointments.get(apt.client_id);
        if (!current || aptDate > current.date) {
          clientLastAppointments.set(apt.client_id, {
            date: aptDate,
            serviceName: apt.service?.name || 'Serviço',
          });
        }
      });

    return clients
      .filter(client => {
        if (!client.is_active) return false;
        const lastAppt = clientLastAppointments.get(client.id);
        if (!lastAppt) return false;
        const daysSinceVisit = differenceInDays(today, lastAppt.date);
        return daysSinceVisit >= 60;
      })
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(client => {
        const lastAppt = clientLastAppointments.get(client.id)!;
        return {
          ...client,
          lastVisit: lastAppt.date,
          daysSinceVisit: differenceInDays(today, lastAppt.date),
          serviceName: lastAppt.serviceName
        };
      })
      .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);
  }, [clients, appointments, today, searchTerm]);

  // Package Progress Report
  const packageProgress = useMemo(() => {
    return packages
      .filter(pkg => pkg.client_id && pkg.is_active)
      .map(pkg => {
        const client = clients.find(c => c.id === pkg.client_id);
        const usedSessions = pkg.sessions_scheduled;
        const remainingSessions = pkg.total_sessions - usedSessions;
        const progress = pkg.total_sessions > 0 
          ? (usedSessions / pkg.total_sessions) * 100 
          : 0;
        const pricePerSession = pkg.total_sessions > 0 ? pkg.total_price / pkg.total_sessions : 0;
        const valueUsed = usedSessions * pricePerSession;
        const valueRemaining = remainingSessions * pricePerSession;
        const isLowSessions = remainingSessions > 0 && remainingSessions <= 3;
        
        return {
          ...pkg,
          client,
          progress,
          usedSessions,
          remainingSessions,
          pricePerSession,
          valueUsed,
          valueRemaining,
          isLowSessions,
          isCompleted: remainingSessions === 0,
        };
      })
      .filter(p => p.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (a.isLowSessions && !b.isLowSessions) return -1;
        if (!a.isLowSessions && b.isLowSessions) return 1;
        return b.progress - a.progress;
      });
  }, [packages, clients, searchTerm]);

  // Package stats
  const packageStats = useMemo(() => {
    const activePackages = packageProgress.filter(p => !p.isCompleted);
    const completedPackages = packageProgress.filter(p => p.isCompleted);
    const totalSold = packageProgress.reduce((sum, p) => sum + p.total_price, 0);
    const totalUsed = packageProgress.reduce((sum, p) => sum + p.valueUsed, 0);
    const totalRemaining = packageProgress.reduce((sum, p) => sum + p.valueRemaining, 0);
    const lowSessionPackages = packageProgress.filter(p => p.isLowSessions);

    return {
      activeCount: activePackages.length,
      completedCount: completedPackages.length,
      totalSold,
      totalUsed,
      totalRemaining,
      lowSessionCount: lowSessionPackages.length,
    };
  }, [packageProgress]);

  const isLoading = clientsLoading || appointmentsLoading || packagesLoading;

  const handleExport = () => {
    if (activeTab === 'aniversariantes') {
      exportToCSV({
        filename: 'aniversariantes',
        headers: ['Nome', 'Tipo', 'Telefone', 'Email', 'Data de Nascimento'],
        rows: aniversariantes.map(p => [
          p.name,
          p.type === 'professional' ? 'Profissional' : 'Cliente',
          p.phone || '',
          p.email || '',
          p.birthDate ? format(p.birthDate, 'dd/MM/yyyy') : ''
        ])
      });
    } else if (activeTab === 'retornos') {
      exportToCSV({
        filename: 'retornos',
        headers: ['Nome', 'Telefone', 'Última Visita', 'Serviço', 'Dias desde Visita', 'Dias em Atraso'],
        rows: retornos.map(c => [
          c.name,
          c.phone || '',
          c.lastVisit ? format(c.lastVisit, 'dd/MM/yyyy') : '',
          c.serviceName || '',
          c.daysSinceVisit,
          c.daysOverdue
        ])
      });
    } else if (activeTab === 'sumidos') {
      exportToCSV({
        filename: 'sumidos',
        headers: ['Nome', 'Telefone', 'Última Visita', 'Serviço', 'Dias Ausente'],
        rows: sumidos.map(c => [
          c.name,
          c.phone || '',
          c.lastVisit ? format(c.lastVisit, 'dd/MM/yyyy') : '',
          c.serviceName || '',
          c.daysSinceVisit
        ])
      });
    } else if (activeTab === 'pacotes') {
      exportToCSV({
        filename: 'pacotes',
        headers: ['Cliente', 'Pacote', 'Sessões Usadas', 'Sessões Restantes', 'Progresso %', 'Valor Total', 'Valor Utilizado'],
        rows: packageProgress.map(p => [
          p.client?.name || '',
          p.name,
          p.usedSessions,
          p.remainingSessions,
          Math.round(p.progress),
          p.total_price,
          p.valueUsed
        ])
      });
    }
  };

  const ClientCard = ({ client, children, type = 'client' }: { client: any, children?: React.ReactNode, type?: 'client' | 'professional' }) => (
    <Card 
      className={`card-hover cursor-pointer transition-all ${type === 'professional' ? 'border-l-4 border-l-blue-500' : ''}`}
      onClick={() => type === 'client' ? navigate(`/clientes/${client.id}`) : null}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={`text-xs font-medium ${type === 'professional' ? 'bg-blue-500/10 text-blue-600' : 'bg-primary/10 text-primary'}`}>
              {client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-foreground truncate">{client.name}</h3>
              {type === 'professional' && (
                <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">Prof.</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </span>
              )}
            </div>
          </div>
          {children}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout title="Relatórios" subtitle="Acompanhe aniversariantes, retornos e clientes sumidos">
      <PageTransition>
        <div className="space-y-4">
          {/* Header com busca e exportar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-xs">
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid h-9">
              <TabsTrigger value="aniversariantes" className="gap-1.5 text-xs px-3">
                <Cake className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Aniversários</span>
                <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{aniversariantes.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="retornos" className="gap-1.5 text-xs px-3">
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Retornos</span>
                <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{retornos.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sumidos" className="gap-1.5 text-xs px-3">
                <UserX className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sumidos</span>
                <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{sumidos.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pacotes" className="gap-1.5 text-xs px-3">
                <Package className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Pacotes</span>
                <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{packageProgress.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <TabsContent value="aniversariantes" className="space-y-4 page-enter">
                  <p className="text-xs text-muted-foreground">
                    Aniversariantes de {format(today, 'MMMM', { locale: ptBR })}
                  </p>
                  {aniversariantes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                      <Cake className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Nenhum aniversariante este mês</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {aniversariantes.map(person => (
                        <ClientCard key={`${person.type}-${person.id}`} client={person} type={person.type}>
                          <div className="text-right">
                            {person.isToday ? (
                              <Badge className="bg-primary text-xs">Hoje! 🎉</Badge>
                            ) : person.isPast ? (
                              <Badge variant="outline" className="text-muted-foreground text-xs">
                                Dia {format(person.birthDate, 'd')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Em {person.daysUntil}d
                              </Badge>
                            )}
                          </div>
                        </ClientCard>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="retornos" className="space-y-4 page-enter">
                  <p className="text-xs text-muted-foreground">
                    Clientes que passaram do tempo de retorno
                  </p>
                  {retornos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                      <RotateCcw className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Nenhum cliente pendente de retorno</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {retornos.map(client => (
                        <ClientCard key={client.id} client={client}>
                          <div className="text-right">
                            <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
                              +{client.daysOverdue}d
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-1">{client.serviceName}</p>
                          </div>
                        </ClientCard>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sumidos" className="space-y-4 page-enter">
                  <p className="text-xs text-muted-foreground">
                    Clientes sem visita há mais de 60 dias
                  </p>
                  {sumidos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                      <UserX className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Nenhum cliente sumido</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sumidos.map(client => (
                        <ClientCard key={client.id} client={client}>
                          <div className="text-right">
                            <Badge variant="outline" className="border-red-500 text-red-600 text-xs">
                              {client.daysSinceVisit}d
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-1">última visita</p>
                          </div>
                        </ClientCard>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pacotes" className="space-y-4 page-enter">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="card-hover">
                      <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ativos</p>
                        <p className="text-xl font-bold text-primary">{packageStats.activeCount}</p>
                      </CardContent>
                    </Card>
                    <Card className="card-hover">
                      <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor Vendido</p>
                        <p className="text-lg font-bold text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(packageStats.totalSold)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="card-hover">
                      <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Utilizado</p>
                        <p className="text-lg font-bold text-blue-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(packageStats.totalUsed)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="card-hover">
                      <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Baixas Sessões</p>
                        <p className="text-xl font-bold text-amber-600">{packageStats.lowSessionCount}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {packageProgress.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                      <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">Nenhum pacote encontrado</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {packageProgress.map(pkg => (
                        <Card key={pkg.id} className={`card-hover ${pkg.isLowSessions ? 'border-l-4 border-l-amber-500' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-sm truncate">{pkg.client?.name}</h3>
                                  {pkg.isLowSessions && (
                                    <Badge variant="outline" className="text-amber-600 border-amber-500 text-[10px]">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Poucas sessões
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{pkg.name}</p>
                              </div>
                              <div className="text-right text-xs">
                                <p className="font-medium">{pkg.usedSessions}/{pkg.total_sessions} sessões</p>
                                <Progress value={pkg.progress} className="h-1.5 w-20 mt-1" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Relatorios;
