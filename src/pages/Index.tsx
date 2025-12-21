import { useState, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Users, Filter } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { SalesOverview } from '@/components/dashboard/SalesOverview';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { CashFlowCard } from '@/components/dashboard/CashFlowCard';
import { ServicesDistribution } from '@/components/dashboard/ServicesDistribution';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAppointments } from '@/hooks/useAppointments';
import { useClientsCredits } from '@/hooks/useClientCredits';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const Index = () => {
  const today = new Date();
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  
  const { professionals } = useProfessionals();
  const { appointments } = useAppointments();
  const { 
    salesData, 
    monthlySalesChart, 
    newClientsChart, 
    servicesDistribution,
    totalClients,
    dailyCashFlow,
    isLoading 
  } = useDashboardStats({ professionalId: selectedProfessional });

  const todayAppointments = appointments.filter(
    apt => isSameDay(new Date(apt.start_time), today) && apt.status !== 'cancelled'
  );

  // Get client IDs from today's appointments for credits check
  const clientIds = useMemo(() => {
    const ids = todayAppointments.map(apt => apt.client_id).filter(Boolean);
    return [...new Set(ids)];
  }, [todayAppointments]);

  const { data: clientCreditsMap } = useClientsCredits(clientIds);

  return (
    <AppLayout 
      title="Dashboard" 
      subtitle={format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
    >
      {/* Filter */}
      <div className="flex items-center gap-3 mb-6">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select 
          value={selectedProfessional || 'all'} 
          onValueChange={(v) => setSelectedProfessional(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os profissionais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os profissionais</SelectItem>
            {professionals.filter(p => p.is_active).map(prof => (
              <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sales Overview */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <SalesOverview
          daily={salesData?.daily || 0}
          monthly={salesData?.monthly || 0}
          yearly={salesData?.yearly || 0}
          monthlyComparison={salesData?.monthlyComparison || 0}
          todayAppointments={salesData?.todayAppointmentsCount || 0}
        />
      )}

      {/* Charts Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Sales & Clients Charts */}
        <SalesChart 
          salesData={monthlySalesChart || []}
          clientsData={newClientsChart || []}
        />

        {/* Cash Flow */}
        <CashFlowCard data={dailyCashFlow} />
      </div>

      {/* Bottom Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Services Distribution */}
        <ServicesDistribution data={servicesDistribution || []} />

        {/* Today's Appointments */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Agenda de Hoje
            </h2>
            <span className="text-sm text-muted-foreground">
              {todayAppointments.length} agendamentos
            </span>
          </div>
          
          {todayAppointments.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {todayAppointments.slice(0, 6).map((appointment, index) => (
                <div 
                  key={appointment.id} 
                  style={{ animationDelay: `${index * 100}ms` }}
                  className="animate-slide-up"
                >
                  <AppointmentCard 
                    appointment={appointment} 
                    clientCredits={clientCreditsMap?.get(appointment.client_id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Calendar className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum agendamento para hoje
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients || 0}</div>
            <p className="text-xs text-muted-foreground">clientes ativos</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agendamentos do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesData?.monthAppointmentsCount || 0}</div>
            <p className="text-xs text-muted-foreground">realizados este mês</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mês Anterior
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(salesData?.lastMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">em vendas</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Index;
