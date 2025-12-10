import { useState, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Filter, User, DoorOpen } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { Skeleton } from '@/components/ui/skeleton';

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');

  const { appointments, isLoading: isLoadingAppointments } = useAppointments();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Filter appointments by professional and room
  const filteredByFilters = useMemo(() => {
    return appointments.filter(apt => {
      // Filter by professional
      if (professionalFilter !== 'all') {
        if (apt.professional_id !== professionalFilter && apt.service?.professional_id !== professionalFilter) {
          return false;
        }
      }
      // Filter by room
      if (roomFilter !== 'all') {
        if (apt.service?.room_id !== roomFilter) {
          return false;
        }
      }
      return true;
    });
  }, [appointments, professionalFilter, roomFilter]);

  // Filter by selected date
  const filteredAppointments = useMemo(() => {
    return filteredByFilters.filter(
      apt => isSameDay(new Date(apt.start_time), selectedDate)
    ).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [filteredByFilters, selectedDate]);

  // Get appointment count for each day (with filters applied)
  const getAppointmentsForDay = (day: Date) => {
    return filteredByFilters.filter(apt => 
      isSameDay(new Date(apt.start_time), day)
    );
  };

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

  const clearFilters = () => {
    setProfessionalFilter('all');
    setRoomFilter('all');
  };

  const hasActiveFilters = professionalFilter !== 'all' || roomFilter !== 'all';

  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeRooms = rooms.filter(r => r.is_active);

  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
        </div>
        
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {activeProfessionals.map((prof) => (
                <SelectItem key={prof.id} value={prof.id}>
                  {prof.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          <Select value={roomFilter} onValueChange={setRoomFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as salas</SelectItem>
              {activeRooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

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
            const dayAppointments = getAppointmentsForDay(day);

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
                    {dayAppointments.length > 3 && (
                      <span className={cn(
                        'text-[10px] ml-0.5',
                        isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      )}>
                        +{dayAppointments.length - 3}
                      </span>
                    )}
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

        {isLoadingAppointments ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : filteredAppointments.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAppointments.map((appointment, index) => (
              <div 
                key={appointment.id}
                style={{ animationDelay: `${index * 100}ms` }}
                className="animate-slide-up"
              >
                <AppointmentCard appointment={appointment} professionals={professionals} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
            <p className="text-muted-foreground">
              {hasActiveFilters 
                ? 'Nenhum agendamento encontrado com os filtros aplicados' 
                : 'Nenhum agendamento para esta data'}
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
