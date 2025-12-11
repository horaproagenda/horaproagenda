import { useState, useMemo } from 'react';
import { 
  format, 
  addDays, 
  addWeeks,
  addMonths,
  startOfWeek, 
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay, 
  isSameMonth,
  getDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  User, 
  DoorOpen,
  Calendar as CalendarIcon,
  LayoutGrid,
  List,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { AppointmentDetailDialog } from '@/components/appointments/AppointmentDetailDialog';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { Appointment, PaymentStatus } from '@/types';

type ViewType = 'day' | 'week' | 'month';

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [viewType, setViewType] = useState<ViewType>('week');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [newAppointmentDialogOpen, setNewAppointmentDialogOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<Date | undefined>();
  const [prefilledTime, setPrefilledTime] = useState<string | undefined>();

  const { appointments, isLoading: isLoadingAppointments, updatePayment } = useAppointments();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { generateTimeSlots, settings } = useBusinessSettings();

  const timeSlots = generateTimeSlots();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(monthStart);
    const end = endOfMonth(monthStart);
    const days = eachDayOfInterval({ start, end });
    
    const firstDayOfMonth = getDay(start);
    const daysFromPrevMonth = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const prevMonthDays = Array.from({ length: daysFromPrevMonth }, (_, i) => 
      addDays(start, -(daysFromPrevMonth - i))
    );
    
    const lastDayOfMonth = getDay(end);
    const daysFromNextMonth = lastDayOfMonth === 0 ? 0 : 7 - lastDayOfMonth;
    const nextMonthDays = Array.from({ length: daysFromNextMonth }, (_, i) => 
      addDays(end, i + 1)
    );
    
    return [...prevMonthDays, ...days, ...nextMonthDays];
  }, [monthStart]);

  // Filter appointments by professional and room
  const filteredByFilters = useMemo(() => {
    return appointments.filter(apt => {
      if (professionalFilter !== 'all') {
        if (apt.professional_id !== professionalFilter && apt.service?.professional_id !== professionalFilter) {
          return false;
        }
      }
      if (roomFilter !== 'all') {
        if (apt.service?.room_id !== roomFilter) {
          return false;
        }
      }
      return true;
    });
  }, [appointments, professionalFilter, roomFilter]);

  // Filter by selected date (for day view)
  const filteredAppointments = useMemo(() => {
    return filteredByFilters.filter(
      apt => isSameDay(new Date(apt.start_time), selectedDate)
    ).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [filteredByFilters, selectedDate]);

  // Get appointments for a specific day and time slot
  const getAppointmentsForSlot = (day: Date, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return filteredByFilters.filter(apt => {
      const aptDate = new Date(apt.start_time);
      return isSameDay(aptDate, day) && 
             aptDate.getHours() === hours && 
             aptDate.getMinutes() === minutes;
    });
  };

  // Check if a slot overlaps with any existing appointment
  const isSlotOccupied = (day: Date, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = new Date(day);
    slotStart.setHours(hours, minutes, 0, 0);
    
    return filteredByFilters.some(apt => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return isSameDay(aptStart, day) && slotStart >= aptStart && slotStart < aptEnd;
    });
  };

  // Get appointment that occupies a specific slot
  const getAppointmentAtSlot = (day: Date, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = new Date(day);
    slotStart.setHours(hours, minutes, 0, 0);
    
    return filteredByFilters.find(apt => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return isSameDay(aptStart, day) && slotStart >= aptStart && slotStart < aptEnd;
    });
  };

  // Get appointment count for each day (with filters applied)
  const getAppointmentsForDay = (day: Date) => {
    return filteredByFilters.filter(apt => 
      isSameDay(new Date(apt.start_time), day)
    );
  };

  const goToPrevious = () => {
    if (viewType === 'day') {
      setSelectedDate(addDays(selectedDate, -1));
    } else if (viewType === 'week') {
      setWeekStart(addWeeks(weekStart, -1));
    } else {
      setMonthStart(addMonths(monthStart, -1));
    }
  };

  const goToNext = () => {
    if (viewType === 'day') {
      setSelectedDate(addDays(selectedDate, 1));
    } else if (viewType === 'week') {
      setWeekStart(addWeeks(weekStart, 1));
    } else {
      setMonthStart(addMonths(monthStart, 1));
    }
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
    setMonthStart(startOfMonth(today));
  };

  const clearFilters = () => {
    setProfessionalFilter('all');
    setRoomFilter('all');
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setDetailDialogOpen(true);
  };

  const handleSlotClick = (day: Date, time: string) => {
    const apt = getAppointmentAtSlot(day, time);
    if (apt) {
      handleAppointmentClick(apt);
    } else {
      setPrefilledDate(day);
      setPrefilledTime(time);
      setNewAppointmentDialogOpen(true);
    }
  };

  const handleNewAppointment = () => {
    setPrefilledDate(selectedDate);
    setPrefilledTime(undefined);
    setNewAppointmentDialogOpen(true);
  };

  const handlePayment = (appointmentId: string, paymentMethods: { method: string; amount: number }[]) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    const totalPaid = (appointment.amount_paid || 0) + paymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const totalPrice = appointment.service?.price || 0;
    const existingMethods = appointment.payment_methods || [];
    const newMethods = [...new Set([...existingMethods, ...paymentMethods.map(p => p.method)])];
    
    let paymentStatus: PaymentStatus = 'pending';
    if (totalPaid >= totalPrice) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    updatePayment.mutate({
      id: appointmentId,
      payment: {
        payment_methods: newMethods,
        amount_paid: totalPaid,
        payment_status: paymentStatus,
      },
    });
  };

  const hasActiveFilters = professionalFilter !== 'all' || roomFilter !== 'all';

  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeRooms = rooms.filter(r => r.is_active);

  const getNavigationLabel = () => {
    if (viewType === 'day') {
      return format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    } else if (viewType === 'week') {
      return format(weekStart, "MMMM 'de' yyyy", { locale: ptBR });
    } else {
      return format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  // Render time slot grid for day view
  const renderTimeSlotDayView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-foreground">
          {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <Button onClick={handleNewAppointment} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo Agendamento
        </Button>
      </div>
      
      <ScrollArea className="h-[600px]">
        <div className="space-y-1">
          {timeSlots.map(time => {
            const apt = getAppointmentAtSlot(selectedDate, time);
            const isStart = apt && format(new Date(apt.start_time), 'HH:mm') === time;
            const profId = apt?.professional_id || apt?.service?.professional_id;
            const prof = professionals.find(p => p.id === profId);
            const color = prof?.agenda_color || '#3B82F6';
            
            // Calculate slot height based on duration
            const slotDuration = settings?.slot_interval || 30;
            const aptDuration = apt?.service?.duration || slotDuration;
            const slotsSpan = Math.ceil(aptDuration / slotDuration);

            return (
              <div
                key={time}
                className={cn(
                  'flex items-stretch gap-3 min-h-[50px] rounded-lg transition-all cursor-pointer',
                  apt ? '' : 'hover:bg-muted/50'
                )}
                onClick={() => handleSlotClick(selectedDate, time)}
              >
                <div className="w-16 flex-shrink-0 flex items-center justify-center text-sm font-medium text-muted-foreground">
                  {time}
                </div>
                <div className={cn(
                  'flex-1 rounded-lg border border-dashed border-border p-2 min-h-[50px]',
                  apt && !isStart && 'opacity-0 pointer-events-none'
                )}>
                  {isStart && apt && (
                    <div 
                      className="h-full rounded-lg p-3 text-white"
                      style={{ 
                        backgroundColor: color,
                        minHeight: `${slotsSpan * 50 - 8}px`
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{apt.client?.name}</p>
                          <p className="text-sm opacity-90">{apt.service?.name}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>R$ {apt.service?.price.toFixed(2)}</p>
                          <p className="opacity-80">{apt.payment_status === 'paid' ? '✓ Pago' : apt.payment_status === 'partial' ? 'Parcial' : 'Pendente'}</p>
                        </div>
                      </div>
                      {prof && (
                        <p className="text-xs mt-2 opacity-80">{prof.name}</p>
                      )}
                    </div>
                  )}
                  {!apt && (
                    <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const renderWeekView = () => (
    <div className="space-y-4">
      {/* Week days header */}
      <div className="grid grid-cols-8 gap-1">
        <div className="w-16" /> {/* Empty space for time column */}
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                setSelectedDate(day);
                setViewType('day');
              }}
              className={cn(
                'flex flex-col items-center rounded-lg p-2 transition-all duration-200',
                isSelected 
                  ? 'bg-primary text-primary-foreground' 
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
                'text-lg font-semibold',
                isSelected ? 'text-primary-foreground' : 'text-foreground'
              )}>
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Time slots grid */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-0.5">
          {timeSlots.map(time => (
            <div key={time} className="grid grid-cols-8 gap-1 min-h-[40px]">
              <div className="w-16 flex items-center justify-center text-xs font-medium text-muted-foreground">
                {time}
              </div>
              {weekDays.map(day => {
                const apt = getAppointmentAtSlot(day, time);
                const isStart = apt && format(new Date(apt.start_time), 'HH:mm') === time;
                const profId = apt?.professional_id || apt?.service?.professional_id;
                const prof = professionals.find(p => p.id === profId);
                const color = prof?.agenda_color || '#3B82F6';

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'rounded border border-dashed border-border/50 min-h-[40px] cursor-pointer transition-all',
                      apt && !isStart && 'opacity-0 pointer-events-none',
                      !apt && 'hover:bg-muted/30 hover:border-primary/30'
                    )}
                    onClick={() => handleSlotClick(day, time)}
                  >
                    {isStart && apt && (
                      <div 
                        className="h-full rounded p-1 text-white text-xs"
                        style={{ backgroundColor: color }}
                      >
                        <p className="font-medium truncate">{apt.client?.name}</p>
                        <p className="truncate opacity-80">{apt.service?.name}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  const renderMonthView = () => (
    <div className="space-y-4">
      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {monthDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, monthStart);
          const dayAppointments = getAppointmentsForDay(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                setSelectedDate(day);
                setViewType('day');
              }}
              className={cn(
                'flex flex-col items-center rounded-lg p-2 min-h-[80px] transition-all duration-200',
                isSelected 
                  ? 'bg-primary text-primary-foreground shadow-glow' 
                  : 'hover:bg-secondary',
                isToday && !isSelected && 'ring-2 ring-primary/30',
                !isCurrentMonth && 'opacity-40'
              )}
            >
              <span className={cn(
                'text-sm font-medium',
                isSelected ? 'text-primary-foreground' : 'text-foreground'
              )}>
                {format(day, 'd')}
              </span>
              
              {dayAppointments.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                  {dayAppointments.slice(0, 4).map((apt, i) => {
                    const profId = apt.professional_id || apt.service?.professional_id;
                    const prof = professionals.find(p => p.id === profId);
                    const color = prof?.agenda_color || '#3B82F6';
                    
                    return (
                      <div 
                        key={i} 
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : color }}
                        title={`${apt.client?.name} - ${apt.service?.name}`}
                      />
                    );
                  })}
                  {dayAppointments.length > 4 && (
                    <span className={cn(
                      'text-[10px]',
                      isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}>
                      +{dayAppointments.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      {/* View Toggle and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" value={viewType} onValueChange={(v) => v && setViewType(v as ViewType)}>
            <ToggleGroupItem value="day" aria-label="Ver dia">
              <List className="h-4 w-4 mr-1" />
              Dia
            </ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Ver semana">
              <LayoutGrid className="h-4 w-4 mr-1" />
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem value="month" aria-label="Ver mês">
              <CalendarIcon className="h-4 w-4 mr-1" />
              Mês
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
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
                    <div className="flex items-center gap-2">
                      {prof.agenda_color && (
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: prof.agenda_color }}
                        />
                      )}
                      {prof.name}
                    </div>
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
      </div>

      {/* Navigation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 font-medium text-foreground capitalize">
              {getNavigationLabel()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={goToToday}>
              Hoje
            </Button>
            {viewType !== 'day' && (
              <Button size="sm" onClick={handleNewAppointment}>
                <Plus className="h-4 w-4 mr-1" />
                Novo
              </Button>
            )}
          </div>
        </div>

        {/* Calendar Views */}
        {isLoadingAppointments ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {viewType === 'day' && renderTimeSlotDayView()}
            {viewType === 'week' && renderWeekView()}
            {viewType === 'month' && renderMonthView()}
          </>
        )}
      </div>

      {/* Appointment Detail Dialog */}
      <AppointmentDetailDialog
        appointment={selectedAppointment}
        professionals={professionals}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onPayment={handlePayment}
      />

      {/* New Appointment Dialog */}
      <NewAppointmentDialog
        open={newAppointmentDialogOpen}
        onOpenChange={setNewAppointmentDialogOpen}
        prefilledDate={prefilledDate}
        prefilledTime={prefilledTime}
      />
    </AppLayout>
  );
};

export default Agenda;
