import React, { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Users, Clock, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OccupancyDashboardProps {
  selectedDate: Date;
  compact?: boolean;
}

export function OccupancyDashboard({ selectedDate, compact = false }: OccupancyDashboardProps) {
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  const { settings } = useBusinessSettings();

  const activeProfessionals = useMemo(() => 
    professionals.filter(p => p.is_active),
    [professionals]
  );

  // Calculate daily working minutes based on business hours
  const dailyWorkingMinutes = useMemo(() => {
    if (!settings?.opening_time || !settings?.closing_time) return 480; // 8h default
    
    const [openH, openM] = settings.opening_time.split(':').map(Number);
    const [closeH, closeM] = settings.closing_time.split(':').map(Number);
    
    return (closeH * 60 + closeM) - (openH * 60 + openM);
  }, [settings]);

  // Week occupancy data
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    
    return days.map(day => {
      const dayApts = appointments.filter(apt => 
        isSameDay(new Date(apt.start_time), day) &&
        !['cancelled', 'missed', 'rescheduled'].includes(apt.status)
      );

      // Calculate total booked minutes
      const bookedMinutes = dayApts.reduce((sum, apt) => {
        const start = new Date(apt.start_time);
        const end = new Date(apt.end_time);
        return sum + differenceInMinutes(end, start);
      }, 0);

      // Available capacity = professionals * working hours
      const totalCapacity = activeProfessionals.length * dailyWorkingMinutes;
      const occupancy = totalCapacity > 0 ? (bookedMinutes / totalCapacity) * 100 : 0;

      return {
        date: day,
        dayName: format(day, 'EEE', { locale: ptBR }),
        dayNumber: format(day, 'd'),
        appointments: dayApts.length,
        bookedMinutes,
        totalCapacity,
        occupancy: Math.min(100, occupancy),
      };
    });
  }, [weekStart, appointments, activeProfessionals, dailyWorkingMinutes]);

  // Professional-specific occupancy
  const professionalOccupancy = useMemo(() => {
    return activeProfessionals.map(prof => {
      const profApts = appointments.filter(apt => 
        isSameDay(new Date(apt.start_time), selectedDate) &&
        (apt.professional_id === prof.id || apt.service?.professional_id === prof.id) &&
        !['cancelled', 'missed', 'rescheduled'].includes(apt.status)
      );

      const bookedMinutes = profApts.reduce((sum, apt) => {
        const start = new Date(apt.start_time);
        const end = new Date(apt.end_time);
        return sum + differenceInMinutes(end, start);
      }, 0);

      const occupancy = (bookedMinutes / dailyWorkingMinutes) * 100;

      return {
        professional: prof,
        appointments: profApts.length,
        bookedMinutes,
        occupancy: Math.min(100, occupancy),
        availableMinutes: Math.max(0, dailyWorkingMinutes - bookedMinutes),
      };
    }).sort((a, b) => b.occupancy - a.occupancy);
  }, [activeProfessionals, appointments, selectedDate, dailyWorkingMinutes]);

  // Today's overall stats
  const todayStats = useMemo(() => {
    const today = weekData.find(d => isSameDay(d.date, selectedDate)) || weekData[0];
    const avgOccupancy = weekData.reduce((sum, d) => sum + d.occupancy, 0) / weekData.length;
    
    return {
      ...today,
      avgWeekOccupancy: avgOccupancy,
      trend: today.occupancy > avgOccupancy ? 'up' : today.occupancy < avgOccupancy ? 'down' : 'neutral',
    };
  }, [weekData, selectedDate]);

  const getOccupancyColor = (occupancy: number) => {
    if (occupancy >= 80) return 'text-success';
    if (occupancy >= 50) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getOccupancyBg = (occupancy: number) => {
    if (occupancy >= 80) return 'bg-success';
    if (occupancy >= 50) return 'bg-warning';
    return 'bg-muted-foreground';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Ocupação Hoje:</span>
          <span className={cn("text-sm font-bold", getOccupancyColor(todayStats.occupancy))}>
            {todayStats.occupancy.toFixed(0)}%
          </span>
        </div>
        <div className="flex-1 max-w-32">
          <Progress value={todayStats.occupancy} className="h-2" />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {todayStats.trend === 'up' && <TrendingUp className="h-3 w-3 text-success" />}
          {todayStats.trend === 'down' && <TrendingDown className="h-3 w-3 text-destructive" />}
          {todayStats.trend === 'neutral' && <Minus className="h-3 w-3" />}
          <span>vs média</span>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          Dashboard de Ocupação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week Overview */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Ocupação da Semana
          </h4>
          <div className="grid grid-cols-7 gap-1">
            {weekData.map((day, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div 
                    className={cn(
                      "flex flex-col items-center p-2 rounded-lg cursor-pointer transition-colors",
                      isSameDay(day.date, selectedDate) 
                        ? "bg-primary/10 border border-primary/30" 
                        : "hover:bg-muted/50"
                    )}
                  >
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {day.dayName}
                    </span>
                    <span className="text-xs font-medium">{day.dayNumber}</span>
                    <div 
                      className={cn(
                        "mt-1 h-1.5 w-full rounded-full",
                        getOccupancyBg(day.occupancy)
                      )}
                      style={{ opacity: 0.3 + (day.occupancy / 100) * 0.7 }}
                    />
                    <span className={cn("text-[10px] font-medium mt-1", getOccupancyColor(day.occupancy))}>
                      {day.occupancy.toFixed(0)}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{format(day.date, "d 'de' MMMM", { locale: ptBR })}</p>
                  <p className="text-xs">{day.appointments} agendamentos</p>
                  <p className="text-xs">{Math.round(day.bookedMinutes / 60)}h ocupadas</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Professional Occupancy */}
        {professionalOccupancy.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Ocupação por Profissional (Hoje)
            </h4>
            <div className="space-y-2">
              {professionalOccupancy.map((prof) => (
                <div key={prof.professional.id} className="flex items-center gap-2">
                  <span className="text-xs w-24 truncate">{prof.professional.name}</span>
                  <div className="flex-1">
                    <Progress value={prof.occupancy} className="h-2" />
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn("text-[10px] min-w-14 justify-center", getOccupancyColor(prof.occupancy))}
                  >
                    {prof.occupancy.toFixed(0)}%
                  </Badge>
                  <span className="text-[10px] text-muted-foreground w-16">
                    {Math.round(prof.availableMinutes / 60)}h livre
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>Média semanal: {todayStats.avgWeekOccupancy.toFixed(0)}%</span>
          <span>{activeProfessionals.length} profissionais ativos</span>
        </div>
      </CardContent>
    </Card>
  );
}
