import { useState, useMemo, useEffect } from 'react';
import { Cake, RotateCcw, UserX, Phone, Mail, Calendar, Sparkles, Package, TrendingUp, DollarSign, Check, Clock, AlertTriangle } from 'lucide-react';
import { format, differenceInDays, parseISO, isSameMonth, isSameDay, addDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { useServicePackages } from '@/hooks/useServicePackages';
import { useProfessionals } from '@/hooks/useProfessionals';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const Relatorios = () => {
  const [activeTab, setActiveTab] = useState('aniversariantes');
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

  // Aniversariantes do mês - clientes e profissionais ativos
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
        // If birthday already passed this month, calculate days since
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

    // Combine and sort: today first, then upcoming by days, then past ones
    return [...clientBirthdays, ...professionalBirthdays]
      .sort((a, b) => {
        if (a.isToday && !b.isToday) return -1;
        if (!a.isToday && b.isToday) return 1;
        if (!a.isPast && b.isPast) return -1;
        if (a.isPast && !b.isPast) return 1;
        return a.daysUntil - b.daysUntil;
      });
  }, [clients, professionals, today, currentMonth, currentDay]);

  // Clientes para retorno - baseado no tempo de retorno do serviço
  const retornos = useMemo(() => {
    // Map client to their last completed appointment with service info
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
        // Show if past return date but not too long (within 2x return period)
        return daysSinceVisit >= lastAppt.returnDays && daysSinceVisit < lastAppt.returnDays * 3;
      })
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
  }, [clients, appointments, today]);

  // Clientes sumidos (última visita há mais de 60 dias - 2 meses)
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
        // Show if more than 60 days (2 months) without visit
        return daysSinceVisit >= 60;
      })
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
  }, [clients, appointments, today]);

  // Package Progress Report - with consolidated view
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
        
        // Check if package is expiring soon (less than 3 sessions remaining)
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
      .sort((a, b) => {
        // Sort by: low sessions first, then by progress descending
        if (a.isLowSessions && !b.isLowSessions) return -1;
        if (!a.isLowSessions && b.isLowSessions) return 1;
        return b.progress - a.progress;
      });
  }, [packages, clients]);

  // Consolidated package stats
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

  const ClientCard = ({ client, children, type = 'client' }: { client: any, children?: React.ReactNode, type?: 'client' | 'professional' }) => (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${type === 'professional' ? 'border-l-4 border-l-blue-500' : ''}`}
      onClick={() => type === 'client' ? navigate(`/clientes/${client.id}`) : null}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className={`font-medium ${type === 'professional' ? 'bg-blue-500/10 text-blue-600' : 'bg-primary/10 text-primary'}`}>
              {client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground truncate">{client.name}</h3>
              {type === 'professional' && (
                <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">Profissional</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </span>
              )}
              {client.email && (
                <span className="flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {client.email}
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
    <AppLayout 
      title="Relatórios" 
      subtitle="Acompanhe aniversariantes, retornos e clientes sumidos"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="aniversariantes" className="gap-2">
            <Cake className="h-4 w-4" />
            <span className="hidden sm:inline">Aniversariantes</span>
            <Badge variant="secondary" className="ml-1">{aniversariantes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="retornos" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Retornos</span>
            <Badge variant="secondary" className="ml-1">{retornos.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sumidos" className="gap-2">
            <UserX className="h-4 w-4" />
            <span className="hidden sm:inline">Sumidos</span>
            <Badge variant="secondary" className="ml-1">{sumidos.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pacotes" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Pacotes</span>
            <Badge variant="secondary" className="ml-1">{packageProgress.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TabsContent value="aniversariantes" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Clientes e profissionais que fazem aniversário em {format(today, 'MMMM', { locale: ptBR })}
              </div>
              {aniversariantes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                  <Cake className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground">
                    Nenhum aniversariante este mês
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {aniversariantes.map(person => (
                    <ClientCard key={`${person.type}-${person.id}`} client={person} type={person.type}>
                      <div className="text-right">
                        {person.isToday ? (
                          <Badge className="bg-primary">Hoje! 🎉</Badge>
                        ) : person.isPast ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Dia {format(person.birthDate, 'd')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Em {person.daysUntil} dias
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(person.birthDate, "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                      </div>
                    </ClientCard>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="retornos" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Clientes que passaram do tempo de retorno do serviço realizado
              </div>
              {retornos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                  <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground">
                    Nenhum cliente pendente de retorno
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure o tempo de retorno nos serviços para ativar este recurso
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {retornos.map(client => (
                    <ClientCard key={client.id} client={client}>
                      <div className="text-right">
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          +{client.daysOverdue} dias
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                          <Sparkles className="h-3 w-3" />
                          {client.serviceName}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Calendar className="h-3 w-3" />
                          {format(client.lastVisit, "dd/MM/yyyy")}
                        </p>
                      </div>
                    </ClientCard>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sumidos" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Clientes sem agendamentos há mais de 2 meses (60 dias)
              </div>
              {sumidos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                  <UserX className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground">
                    Nenhum cliente sumido
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sumidos.map(client => (
                    <ClientCard key={client.id} client={client}>
                      <div className="text-right">
                        <Badge variant="destructive">
                          {client.daysSinceVisit} dias
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                          <Sparkles className="h-3 w-3" />
                          {client.serviceName}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Calendar className="h-3 w-3" />
                          {format(client.lastVisit, "dd/MM/yyyy")}
                        </p>
                      </div>
                    </ClientCard>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pacotes" className="space-y-6">
              {/* Package Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Pacotes Ativos</p>
                        <p className="text-2xl font-bold">{packageStats.activeCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor Vendido</p>
                        <p className="text-2xl font-bold">R$ {packageStats.totalSold.toFixed(2)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Check className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor Utilizado</p>
                        <p className="text-2xl font-bold">R$ {packageStats.totalUsed.toFixed(2)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Saldo Restante</p>
                        <p className="text-2xl font-bold">R$ {packageStats.totalRemaining.toFixed(2)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Alert for low session packages */}
              {packageStats.lowSessionCount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    {packageStats.lowSessionCount} pacote(s) com 3 ou menos sessões restantes
                  </span>
                </div>
              )}

              {/* Package Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pacotes Vendidos vs Utilizados</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {packageProgress.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center m-6">
                      <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
                      <p className="mt-3 text-muted-foreground">
                        Nenhum pacote ativo
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Pacote</TableHead>
                            <TableHead className="text-center">Sessões</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-right">Utilizado</TableHead>
                            <TableHead className="text-right">Saldo</TableHead>
                            <TableHead className="text-center">Progresso</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packageProgress.map(pkg => (
                            <TableRow 
                              key={pkg.id} 
                              className={`cursor-pointer hover:bg-muted/50 ${pkg.isLowSessions ? 'bg-amber-500/5' : ''}`}
                              onClick={() => pkg.client && navigate(`/clientes/${pkg.client.id}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                      {pkg.client?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'N/A'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium">{pkg.client?.name || 'Cliente'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{pkg.name}</span>
                                  {pkg.isLowSessions && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
                                      Poucas sessões
                                    </Badge>
                                  )}
                                  {pkg.isCompleted && (
                                    <Badge className="bg-green-500 text-xs">Concluído</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-medium">{pkg.usedSessions}</span>
                                <span className="text-muted-foreground">/{pkg.total_sessions}</span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                R$ {pkg.total_price.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-green-600">
                                R$ {pkg.valueUsed.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-amber-600 font-medium">
                                R$ {pkg.valueRemaining.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-2">
                                  <Progress value={pkg.progress} className="h-2 w-16" />
                                  <span className="text-xs text-muted-foreground">{pkg.progress.toFixed(0)}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </AppLayout>
  );
};

export default Relatorios;
