import { Card, CardContent } from '@/components/ui/card';
import { Calendar, CheckCircle, XCircle, Clock, DollarSign, TrendingUp, UserX } from 'lucide-react';

interface ClientStatsSectionProps {
  stats: {
    totalAppointments: number;
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

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      <Card className="border-blue-200 dark:border-blue-800">
        <CardContent className="p-3 text-center">
          <Calendar className="h-4 w-4 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{stats.totalAppointments}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </CardContent>
      </Card>

      <Card className="border-green-200 dark:border-green-800">
        <CardContent className="p-3 text-center">
          <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-600 dark:text-green-400" />
          <p className="text-lg font-bold text-green-700 dark:text-green-300">{stats.completedAppointments}</p>
          <p className="text-[10px] text-muted-foreground">Realizados</p>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-3 text-center">
          <XCircle className="h-4 w-4 mx-auto mb-1 text-red-600 dark:text-red-400" />
          <p className="text-lg font-bold text-red-700 dark:text-red-300">{stats.cancelledAppointments}</p>
          <p className="text-[10px] text-muted-foreground">Cancelados</p>
        </CardContent>
      </Card>

      <Card className="border-orange-200 dark:border-orange-800">
        <CardContent className="p-3 text-center">
          <UserX className="h-4 w-4 mx-auto mb-1 text-orange-600 dark:text-orange-400" />
          <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{stats.missedAppointments}</p>
          <p className="text-[10px] text-muted-foreground">Faltou</p>
        </CardContent>
      </Card>

      <Card className="border-purple-200 dark:border-purple-800">
        <CardContent className="p-3 text-center">
          <Clock className="h-4 w-4 mx-auto mb-1 text-purple-600 dark:text-purple-400" />
          <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{stats.rescheduledAppointments}</p>
          <p className="text-[10px] text-muted-foreground">Reagendados</p>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground">Total Gasto</p>
        </CardContent>
      </Card>

      <Card className="border-cyan-200 dark:border-cyan-800">
        <CardContent className="p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-cyan-600 dark:text-cyan-400" />
          <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">
            R$ {avgPerProcedure.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground">Média</p>
        </CardContent>
      </Card>
    </div>
  );
}
