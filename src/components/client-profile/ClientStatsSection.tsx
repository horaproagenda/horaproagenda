import { Card, CardContent } from '@/components/ui/card';
import { Calendar, CheckCircle, XCircle, Clock, DollarSign, TrendingUp } from 'lucide-react';

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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4 text-center">
          <Calendar className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.totalAppointments}</p>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80">Total Agendamentos</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
        <CardContent className="p-4 text-center">
          <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600 dark:text-green-400" />
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.completedAppointments}</p>
          <p className="text-xs text-green-600/80 dark:text-green-400/80">Realizados</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-200 dark:border-red-800">
        <CardContent className="p-4 text-center">
          <XCircle className="h-6 w-6 mx-auto mb-2 text-red-600 dark:text-red-400" />
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.cancelledAppointments}</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80">Cancelados</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
        <CardContent className="p-4 text-center">
          <XCircle className="h-6 w-6 mx-auto mb-2 text-orange-600 dark:text-orange-400" />
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.missedAppointments}</p>
          <p className="text-xs text-orange-600/80 dark:text-orange-400/80">Faltou</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
        <CardContent className="p-4 text-center">
          <Clock className="h-6 w-6 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.rescheduledAppointments}</p>
          <p className="text-xs text-purple-600/80 dark:text-purple-400/80">Reagendados</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Total Gasto</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/30 dark:to-cyan-900/20 border-cyan-200 dark:border-cyan-800">
        <CardContent className="p-4 text-center">
          <TrendingUp className="h-6 w-6 mx-auto mb-2 text-cyan-600 dark:text-cyan-400" />
          <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">
            R$ {avgPerProcedure.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-cyan-600/80 dark:text-cyan-400/80">Média/Procedimento</p>
        </CardContent>
      </Card>
    </div>
  );
}
