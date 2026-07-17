import { useState, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { format, isSameDay } from 'date-fns';
import { useIsSmartphone } from '@/hooks/use-mobile';
import { ptBR } from 'date-fns/locale';
import { Calendar, Users, Filter, ShieldCheck, Crown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { SalesOverview } from '@/components/dashboard/SalesOverview';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { CashFlowCard } from '@/components/dashboard/CashFlowCard';
import { ServicesDistribution } from '@/components/dashboard/ServicesDistribution';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAppointments } from '@/hooks/useAppointments';
import { useClientsCredits } from '@/hooks/useClientCredits';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdminEmail } from '@/lib/superAdminAllowlist';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const Index = () => {
  const isSmartphone = useIsSmartphone();
  const today = new Date();
  const [selectedProfessional, setSelectedProfessional] = useLocalStorage<string | null>('dashboard-professional', null);
  
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

  const clientIds = useMemo(() => {
    const ids = todayAppointments.map(apt => apt.client_id).filter(Boolean);
    return [...new Set(ids)];
  }, [todayAppointments]);

  const { data: clientCreditsMap } = useClientsCredits(clientIds);

  if (isSmartphone) return <Navigate to="/agenda" replace />;

  return (
    <AppLayout 
      title="Dashboard" 
      subtitle={format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
    >
      <PageTransition>
        {/* Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select 
            value={selectedProfessional || 'all'} 
            onValueChange={(v) => setSelectedProfessional(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Todos" />
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="card-hover">
                <CardHeader className="pb-2">
                  <Skeleton className="h-3 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-6 w-28" />
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
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <SalesChart 
            salesData={monthlySalesChart || []}
            clientsData={newClientsChart || []}
          />
          <CashFlowCard data={dailyCashFlow} />
        </div>

        {/* Bottom Grid */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ServicesDistribution data={servicesDistribution || []} />

          {/* Today's Appointments */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Agenda de Hoje
              </h2>
              <span className="text-xs text-muted-foreground">
                {todayAppointments.length} agendamentos
              </span>
            </div>
            
            {todayAppointments.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {todayAppointments.slice(0, 6).map((appointment, index) => (
                  <div 
                    key={appointment.id} 
                    style={{ animationDelay: `${index * 50}ms` }}
                    className="animate-fade-in"
                  >
                    <AppointmentCard appointment={appointment} />
                  </div>
                ))}
              </div>
            ) : (
              <Card className="card-hover">
                <CardContent className="py-6 text-center">
                  <Calendar className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum agendamento para hoje
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Card className="card-hover">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                Total de Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-base font-bold">{totalClients || 0}</div>
              <p className="text-[10px] text-muted-foreground">clientes ativos</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">
                Agendamentos do Mês
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-base font-bold">{salesData?.monthAppointmentsCount || 0}</div>
              <p className="text-[10px] text-muted-foreground">realizados este mês</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">
                Mês Anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-base font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(salesData?.lastMonth || 0)}
              </div>
              <p className="text-[10px] text-muted-foreground">em vendas</p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Index;
