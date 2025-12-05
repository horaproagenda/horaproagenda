import { useState, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockAppointments } from '@/data/mockData';

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const filteredAppointments = useMemo(() => {
    return mockAppointments.filter(
      apt => isSameDay(apt.date, selectedDate)
    ).sort((a, b) => a.time.localeCompare(b.time));
  }, [selectedDate]);

  const goToPreviousWeek = () => {
    setWeekStart(addDays(weekStart, -7));
  };

  const goToNextWeek = () => {
    setWeekStart(addDays(weekStart, 7));
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
  };

  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      {/* Week Navigation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 font-medium text-foreground">
              {format(weekStart, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Hoje
          </Button>
        </div>

        {/* Week Days */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(day => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const dayAppointments = mockAppointments.filter(apt => isSameDay(apt.date, day));

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'flex flex-col items-center rounded-xl p-3 transition-all duration-200',
                  isSelected 
                    ? 'bg-primary text-primary-foreground shadow-glow' 
                    : 'hover:bg-secondary',
                  isToday && !isSelected && 'ring-2 ring-primary/30'
                )}
              >
                <span className={cn(
                  'text-xs font-medium uppercase',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}>
                  {format(day, 'EEE', { locale: ptBR })}
                </span>
                <span className={cn(
                  'mt-1 text-xl font-semibold',
                  isSelected ? 'text-primary-foreground' : 'text-foreground'
                )}>
                  {format(day, 'd')}
                </span>
                {dayAppointments.length > 0 && (
                  <div className={cn(
                    'mt-1 flex gap-0.5',
                  )}>
                    {dayAppointments.slice(0, 3).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isSelected ? 'bg-primary-foreground/70' : 'bg-primary'
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Appointments List */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          <span className="text-sm text-muted-foreground">
            {filteredAppointments.length} agendamento{filteredAppointments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredAppointments.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAppointments.map((appointment, index) => (
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
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
            <p className="text-muted-foreground">
              Nenhum agendamento para esta data
            </p>
            <Button className="mt-4" variant="secondary">
              Criar Agendamento
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Agenda;
