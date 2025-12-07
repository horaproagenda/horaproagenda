import { useState, useMemo } from 'react';
import { Cake, RotateCcw, UserX, Phone, Mail, Calendar } from 'lucide-react';
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

  // Clientes para retorno (última visita há mais de 30 dias, mas menos de 90)
  const retornos = useMemo(() => {
    const clientLastAppointment = new Map<string, Date>();
    
    appointments
      .filter(apt => apt.status === 'completed')
      .forEach(apt => {
        const aptDate = parseISO(apt.start_time);
        const current = clientLastAppointment.get(apt.client_id);
        if (!current || aptDate > current) {
          clientLastAppointment.set(apt.client_id, aptDate);
        }
      });

    return clients
      .filter(client => {
        const lastVisit = clientLastAppointment.get(client.id);
        if (!lastVisit) return false;
        const daysSinceVisit = differenceInDays(today, lastVisit);
        return daysSinceVisit >= 30 && daysSinceVisit < 90;
      })
      .map(client => ({
        ...client,
        lastVisit: clientLastAppointment.get(client.id)!,
        daysSinceVisit: differenceInDays(today, clientLastAppointment.get(client.id)!)
      }))
      .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);
  }, [clients, appointments, today]);

  // Clientes sumidos (última visita há mais de 90 dias)
  const sumidos = useMemo(() => {
    const clientLastAppointment = new Map<string, Date>();
    
    appointments
      .filter(apt => apt.status === 'completed')
      .forEach(apt => {
        const aptDate = parseISO(apt.start_time);
        const current = clientLastAppointment.get(apt.client_id);
        if (!current || aptDate > current) {
          clientLastAppointment.set(apt.client_id, aptDate);
        }
      });

    return clients
      .filter(client => {
        const lastVisit = clientLastAppointment.get(client.id);
        if (!lastVisit) return false;
        const daysSinceVisit = differenceInDays(today, lastVisit);
        return daysSinceVisit >= 90;
      })
      .map(client => ({
        ...client,
        lastVisit: clientLastAppointment.get(client.id)!,
        daysSinceVisit: differenceInDays(today, clientLastAppointment.get(client.id)!)
      }))
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
                Clientes que não visitam há 30-90 dias e podem precisar de um retorno
              </div>
              {retornos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                  <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground">
                    Nenhum cliente pendente de retorno
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {retornos.map(client => (
                    <ClientCard key={client.id} client={client}>
                      <div className="text-right">
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          {client.daysSinceVisit} dias
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
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
                Clientes que não visitam há mais de 90 dias
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
