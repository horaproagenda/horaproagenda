import { useState, useMemo } from 'react';
import { Cake, RotateCcw, UserX, Phone, Mail, Calendar, Sparkles } from 'lucide-react';
import { format, differenceInDays, parseISO, isSameMonth, isSameDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useClients } from '@/hooks/useClients';
import { useAppointments } from '@/hooks/useAppointments';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Relatorios = () => {
  const [activeTab, setActiveTab] = useState('aniversariantes');
  const { clients, isLoading: clientsLoading } = useClients();
  const { appointments, isLoading: appointmentsLoading } = useAppointments();
  const navigate = useNavigate();

  const today = new Date();

  // Aniversariantes do mês
  const aniversariantes = useMemo(() => {
    return clients
      .filter(client => {
        if (!client.birthdate) return false;
        const birthDate = parseISO(client.birthdate);
        return isSameMonth(birthDate, today);
      })
      .map(client => {
        const birthDate = parseISO(client.birthdate!);
        const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        const daysUntil = differenceInDays(thisYearBirthday, today);
        const isToday = isSameDay(thisYearBirthday, today);
        return { ...client, birthDate, daysUntil, isToday };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [clients, today]);

  // Clientes para retorno - baseado no tempo de retorno do serviço
  const retornos = useMemo(() => {
    // Map client to their last completed appointment with service info
    const clientLastAppointments = new Map<string, { date: Date; serviceName: string; returnDays: number }>();
    
    appointments
      .filter(apt => apt.status === 'completed' && apt.service?.return_days)
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

  // Clientes sumidos (última visita há mais de 3x o tempo de retorno ou +90 dias se não tiver retorno definido)
  const sumidos = useMemo(() => {
    const clientLastAppointments = new Map<string, { date: Date; serviceName: string; returnDays: number | null }>();
    
    appointments
      .filter(apt => apt.status === 'completed')
      .forEach(apt => {
        const aptDate = parseISO(apt.start_time);
        const current = clientLastAppointments.get(apt.client_id);
        if (!current || aptDate > current.date) {
          clientLastAppointments.set(apt.client_id, {
            date: aptDate,
            serviceName: apt.service?.name || 'Serviço',
            returnDays: apt.service?.return_days || null
          });
        }
      });

    return clients
      .filter(client => {
        const lastAppt = clientLastAppointments.get(client.id);
        if (!lastAppt) return false;
        const daysSinceVisit = differenceInDays(today, lastAppt.date);
        const threshold = lastAppt.returnDays ? lastAppt.returnDays * 3 : 90;
        return daysSinceVisit >= threshold;
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

  const isLoading = clientsLoading || appointmentsLoading;

  const ClientCard = ({ client, children }: { client: typeof clients[0], children?: React.ReactNode }) => (
    <Card 
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={() => navigate(`/clientes/${client.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {client.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground truncate">{client.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {client.phone}
              </span>
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
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
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
        </TabsList>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TabsContent value="aniversariantes" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Clientes que fazem aniversário em {format(today, 'MMMM', { locale: ptBR })}
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
                  {aniversariantes.map(client => (
                    <ClientCard key={client.id} client={client}>
                      <div className="text-right">
                        {client.isToday ? (
                          <Badge className="bg-primary">Hoje! 🎉</Badge>
                        ) : client.daysUntil < 0 ? (
                          <Badge variant="outline">
                            Dia {format(client.birthDate, 'd')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Em {client.daysUntil} dias
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(client.birthDate, "dd 'de' MMMM", { locale: ptBR })}
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
                Clientes inativos há muito tempo (3x o tempo de retorno ou +90 dias)
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
          </>
        )}
      </Tabs>
    </AppLayout>
  );
};

export default Relatorios;
