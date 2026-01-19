import { Calendar, CheckCircle, XCircle, Clock, DollarSign, TrendingUp, UserX } from 'lucide-react';

interface ClientStatsSectionProps {
  stats: {
    totalAppointments: number;
    scheduledAppointments?: number;
    completedAppointments: number;
    cancelledAppointments: number;
    missedAppointments: number;
    rescheduledAppointments: number;
    totalRevenue: number;
    proceduresCount: number;
  };
}

export function ClientStatsSection({ stats }: ClientStatsSectionProps) {
  const avgPerProcedure = stats.proceduresCount > 0 
    ? stats.totalRevenue / stats.proceduresCount 
    : 0;

  const statItems = [
    { icon: Calendar, value: stats.totalAppointments, label: 'Agendados', color: 'text-blue-500' },
    { icon: CheckCircle, value: stats.completedAppointments, label: 'Realizados', color: 'text-success' },
    { icon: XCircle, value: stats.cancelledAppointments, label: 'Cancelados', color: 'text-destructive' },
    { icon: UserX, value: stats.missedAppointments, label: 'Faltou', color: 'text-warning' },
    { icon: Clock, value: stats.rescheduledAppointments, label: 'Reagendados', color: 'text-primary' },
    { 
      icon: DollarSign, 
      value: `R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
      label: 'Recebido', 
      color: 'text-success' 
    },
    { 
      icon: TrendingUp, 
      value: `R$ ${avgPerProcedure.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
      label: 'Média', 
      color: 'text-info' 
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {statItems.map((item, index) => (
        <div 
          key={index}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/50 bg-card/50 transition-all duration-200 hover:bg-card hover:shadow-sm"
        >
          <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
          <span className="text-sm font-medium">{item.value}</span>
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
