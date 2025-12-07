import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Users, Sparkles, DollarSign, TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { mockAppointments, mockClients, mockServices } from '@/data/mockData';
import { getCategoryColor } from '@/lib/categoryColors';

const Index = () => {
  const today = new Date();
  const todayAppointments = mockAppointments.filter(
    apt => isSameDay(new Date(apt.start_time), today)
  );
  
  const confirmedToday = todayAppointments.filter(apt => apt.status === 'confirmed').length;
  const todayRevenue = todayAppointments.reduce((acc, apt) => acc + (apt.service?.price || 0), 0);

  return (
    <AppLayout 
      title="Dashboard" 
      subtitle={format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
    >
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Agendamentos Hoje"
          value={todayAppointments.length}
          icon={<Calendar className="h-5 w-5 text-primary" />}
          description={`${confirmedToday} confirmados`}
        />
        <StatCard
          title="Total de Clientes"
          value={mockClients.length}
          icon={<Users className="h-5 w-5 text-primary" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Serviços Ativos"
          value={mockServices.length}
          icon={<Sparkles className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Receita do Dia"
          value={`R$ ${todayRevenue.toFixed(0)}`}
          icon={<DollarSign className="h-5 w-5 text-primary" />}
          trend={{ value: 8, isPositive: true }}
        />
      </div>

      {/* Content Grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Agenda de Hoje
            </h2>
            <span className="text-sm text-muted-foreground">
              {todayAppointments.length} agendamentos
            </span>
          </div>
          
          {todayAppointments.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {todayAppointments.map((appointment, index) => (
                <div 
                  key={appointment.id} 
                  style={{ animationDelay: `${index * 100}ms` }}
                  className="animate-slide-up"
                >
                  <AppointmentCard appointment={appointment} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum agendamento para hoje
              </p>
            </div>
          )}
        </div>

        {/* Quick Stats / Upcoming */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Resumo Rápido
          </h2>
          
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Desempenho</p>
                <p className="text-xs text-muted-foreground">Este mês</p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Agendamentos</span>
                <span className="font-semibold">{mockAppointments.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Clientes atendidos</span>
                <span className="font-semibold">23</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Taxa de confirmação</span>
                <span className="font-semibold text-success">87%</span>
              </div>
            </div>
          </div>

          {/* Popular Services */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground mb-3">Serviços Populares</p>
            <div className="space-y-2">
              {mockServices.slice(0, 4).map(service => (
                <div 
                  key={service.id} 
                  className="flex items-center gap-2 text-sm"
                >
                  <div 
                    className="h-2 w-2 rounded-full" 
                    style={{ backgroundColor: getCategoryColor(service.category).hex }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">
                    {service.name}
                  </span>
                  <span className="text-foreground font-medium">
                    R$ {service.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;