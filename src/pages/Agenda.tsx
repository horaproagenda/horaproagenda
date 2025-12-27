import { useState, useMemo, useCallback } from 'react';
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
  GripVertical,
  Wrench, 
  UserX,
  ChevronDown,
  Search,
  Gift,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { AppointmentDetailDialog } from '@/components/appointments/AppointmentDetailDialog';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { ProfessionalAbsenceDialog } from '@/components/appointments/ProfessionalAbsenceDialog';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { useClientsCredits } from '@/hooks/useClientCredits';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useAutoCompleteAppointments } from '@/hooks/useAutoCompleteAppointments';
import { Skeleton } from '@/components/ui/skeleton';
import { Appointment, PaymentStatus } from '@/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ViewType = 'day' | 'week' | 'month' | 'professional';

const Agenda = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('all');
  const [showOnlyWithCredits, setShowOnlyWithCredits] = useState(false);
  const [viewType, setViewType] = useState<ViewType>('week');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [newAppointmentDialogOpen, setNewAppointmentDialogOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<Date | undefined>();
  const [prefilledTime, setPrefilledTime] = useState<string | undefined>();
  const [draggedAppointment, setDraggedAppointment] = useState<Appointment | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    appointment: Appointment;
    newStartTime: Date;
    newEndTime: Date;
  } | null>(null);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState<typeof absences[0] | null>(null);

  const { appointments, isLoading: isLoadingAppointments, updatePayment, updateAppointment } = useAppointments();
  const { professionals, isLoading: isLoadingProfessionals } = useProfessionals();
  const { rooms, isLoading: isLoadingRooms } = useRooms();
  const { equipment, isLoading: isLoadingEquipment } = useEquipment();
  const { settings, generateTimeSlots, isLoading: isLoadingSettings } = useBusinessSettings();
  const { absences, isLoading: isLoadingAbsences } = useProfessionalAbsences();
  const { currentOpenRegister } = useCashRegisters();
  
  // Auto-complete appointments when setting is enabled
  useAutoCompleteAppointments();

  // Get unique client IDs from appointments and fetch their credits
  const clientIds = useMemo(() => {
    const ids = appointments.map(apt => apt.client_id).filter(Boolean);
    return [...new Set(ids)];
  }, [appointments]);
  
  const { data: clientCreditsMap } = useClientsCredits(clientIds);

  const isLoading = isLoadingAppointments || isLoadingProfessionals || isLoadingRooms || isLoadingSettings || isLoadingEquipment || isLoadingAbsences;
  const dragAndDropEnabled = settings?.drag_and_drop_enabled ?? true;

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

  // Filter appointments by search, professional, room and credits
  const filteredByFilters = useMemo(() => {
    return appointments.filter(apt => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const clientMatch = apt.client?.name?.toLowerCase().includes(search);
        const serviceMatch = apt.service?.name?.toLowerCase().includes(search);
        const phoneMatch = apt.client?.phone?.includes(search);
        if (!clientMatch && !serviceMatch && !phoneMatch) {
          return false;
        }
      }
      
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
      
      // Filter by clients with available credits
      if (showOnlyWithCredits && clientCreditsMap) {
        const clientCredits = clientCreditsMap.get(apt.client_id);
        if (!clientCredits || clientCredits.totalCredits <= 0) {
          return false;
        }
      }
      
      return true;
    });
  }, [appointments, searchTerm, professionalFilter, roomFilter, showOnlyWithCredits, clientCreditsMap]);

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

  // Check if a slot has a professional absence
  const getAbsenceAtSlot = (day: Date, time: string, professionalId?: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = new Date(day);
    slotStart.setHours(hours, minutes, 0, 0);
    
    return absences.find(absence => {
      const absenceStart = new Date(absence.start_time);
      const absenceEnd = new Date(absence.end_time);
      const overlaps = slotStart >= absenceStart && slotStart < absenceEnd;
      
      if (professionalId) {
        return overlaps && absence.professional_id === professionalId;
      }
      return overlaps;
    });
  };

  // Get absences for a specific day
  const getAbsencesForDay = (day: Date) => {
    return absences.filter(absence => {
      const absenceStart = new Date(absence.start_time);
      return isSameDay(absenceStart, day);
    });
  };

  // Get appointment count for each day (with filters applied)
  const getAppointmentsForDay = (day: Date) => {
    return filteredByFilters.filter(apt => 
      isSameDay(new Date(apt.start_time), day)
    );
  };

  const goToPrevious = () => {
    if (viewType === 'day' || viewType === 'professional') {
      setSelectedDate(addDays(selectedDate, -1));
    } else if (viewType === 'week') {
      setWeekStart(addWeeks(weekStart, -1));
    } else {
      setMonthStart(addMonths(monthStart, -1));
    }
  };

  const goToNext = () => {
    if (viewType === 'day' || viewType === 'professional') {
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
    setEquipmentFilter('all');
    setShowOnlyWithCredits(false);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setDetailDialogOpen(true);
  };

  const handleSlotClick = (day: Date, time: string, professionalId?: string) => {
    // Check for absence first
    const absence = getAbsenceAtSlot(day, time, professionalId);
    if (absence) {
      setEditingAbsence(absence);
      setAbsenceDialogOpen(true);
      return;
    }
    
    const apt = getAppointmentAtSlot(day, time);
    if (apt) {
      handleAppointmentClick(apt);
    } else {
      setPrefilledDate(day);
      setPrefilledTime(time);
      setNewAppointmentDialogOpen(true);
    }
  };

  const handleAbsenceClick = (absence: typeof absences[0]) => {
    setEditingAbsence(absence);
    setAbsenceDialogOpen(true);
  };

  const handleOpenNewAbsence = () => {
    setEditingAbsence(null);
    setAbsenceDialogOpen(true);
  };

  const handleNewAppointment = () => {
    setPrefilledDate(selectedDate);
    setPrefilledTime(undefined);
    setNewAppointmentDialogOpen(true);
  };

  const handlePayment = (appointmentId: string, paymentMethods: { method: string; amount: number }[], clientCredit?: number) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    const paymentTotal = paymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const creditAmount = clientCredit || 0;
    const totalPaid = (appointment.amount_paid || 0) + paymentTotal + creditAmount;
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
        client_credit: creditAmount > 0 ? creditAmount : undefined,
        client_id: appointment.client_id,
      },
    });
  };

  const hasActiveFilters = professionalFilter !== 'all' || roomFilter !== 'all' || equipmentFilter !== 'all' || showOnlyWithCredits;
  const activeEquipment = equipment.filter(e => e.is_active);

  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeRooms = rooms.filter(r => r.is_active);

  const getNavigationLabel = () => {
    if (viewType === 'day' || viewType === 'professional') {
      return format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    } else if (viewType === 'week') {
      return format(weekStart, "MMMM 'de' yyyy", { locale: ptBR });
    } else {
      return format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, apt: Appointment) => {
    if (!dragAndDropEnabled) return;
    setDraggedAppointment(apt);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', apt.id);
  }, [dragAndDropEnabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!dragAndDropEnabled || !draggedAppointment) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, [dragAndDropEnabled, draggedAppointment]);

  const handleDrop = useCallback((e: React.DragEvent, targetDay: Date, targetTime: string) => {
    e.preventDefault();
    if (!dragAndDropEnabled || !draggedAppointment) return;

    const [hours, minutes] = targetTime.split(':').map(Number);
    const newStartTime = new Date(targetDay);
    newStartTime.setHours(hours, minutes, 0, 0);

    // Calculate duration from original appointment
    const originalStart = new Date(draggedAppointment.start_time);
    const originalEnd = new Date(draggedAppointment.end_time);
    const duration = originalEnd.getTime() - originalStart.getTime();

    const newEndTime = new Date(newStartTime.getTime() + duration);

    // Check for professional absence conflicts
    const dragProfId = draggedAppointment.professional_id || draggedAppointment.service?.professional_id;
    const hasAbsenceConflict = absences.some(absence => {
      if (absence.professional_id !== dragProfId) return false;
      const absenceStart = new Date(absence.start_time);
      const absenceEnd = new Date(absence.end_time);
      return newStartTime < absenceEnd && newEndTime > absenceStart;
    });

    if (hasAbsenceConflict) {
      toast.error('Profissional está ausente neste horário!');
      setDraggedAppointment(null);
      return;
    }

    // Check for conflicts at new time
    const hasConflict = appointments.some(apt => {
      if (apt.id === draggedAppointment.id) return false;
      
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      const overlaps = newStartTime < aptEnd && newEndTime > aptStart;
      if (!overlaps) return false;

      // Check if same professional or room
      const aptProfId = apt.professional_id || apt.service?.professional_id;
      const dragRoomId = draggedAppointment.room_id || draggedAppointment.service?.room_id;
      const aptRoomId = apt.room_id || apt.service?.room_id;

      return (dragProfId && aptProfId === dragProfId) || (dragRoomId && aptRoomId === dragRoomId);
    });

    if (hasConflict) {
      toast.error('Conflito de horário! Profissional ou sala já ocupados.');
      setDraggedAppointment(null);
      return;
    }

    // Show confirmation dialog instead of directly updating
    setPendingMove({
      appointment: draggedAppointment,
      newStartTime,
      newEndTime,
    });
    setDraggedAppointment(null);
  }, [dragAndDropEnabled, draggedAppointment, appointments, absences]);

  const confirmMove = useCallback(() => {
    if (!pendingMove) return;

    updateAppointment.mutate({
      id: pendingMove.appointment.id,
      updates: {
        start_time: pendingMove.newStartTime.toISOString(),
        end_time: pendingMove.newEndTime.toISOString(),
      },
    });

    setPendingMove(null);
  }, [pendingMove, updateAppointment]);

  const cancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedAppointment(null);
  }, []);

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
            const absence = getAbsenceAtSlot(selectedDate, time);
            const isStart = apt && format(new Date(apt.start_time), 'HH:mm') === time;
            const isAbsenceStart = absence && format(new Date(absence.start_time), 'HH:mm') === time;
            const profId = apt?.professional_id || apt?.service?.professional_id;
            const prof = professionals.find(p => p.id === profId);
            const absenceProf = absence?.professional ? professionals.find(p => p.id === absence.professional_id) : null;
            const color = prof?.agenda_color || '#3B82F6';
            
            // Calculate slot height based on duration
            const slotDuration = settings?.slot_interval || 30;
            const aptDuration = apt?.service?.duration || slotDuration;
            const slotsSpan = Math.ceil(aptDuration / slotDuration);
            const isDragging = draggedAppointment?.id === apt?.id;

            // Calculate absence span
            const absenceDuration = absence ? 
              (new Date(absence.end_time).getTime() - new Date(absence.start_time).getTime()) / 60000 : 0;
            const absenceSlotsSpan = Math.ceil(absenceDuration / slotDuration);

            return (
              <div
                key={time}
                className={cn(
                  'flex items-stretch gap-3 min-h-[50px] rounded-lg transition-all',
                  apt ? '' : absence ? '' : 'hover:bg-muted/50 cursor-pointer',
                  draggedAppointment && !apt && !absence && 'bg-primary/5 border-2 border-dashed border-primary/30'
                )}
                onClick={() => !draggedAppointment && !absence && handleSlotClick(selectedDate, time)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, selectedDate, time)}
              >
                <div className="w-16 flex-shrink-0 flex items-center justify-center text-sm font-medium text-muted-foreground">
                  {time}
                </div>
                <div className={cn(
                  'flex-1 rounded-lg border border-dashed border-border p-2 min-h-[50px]',
                  (apt && !isStart) && 'opacity-0 pointer-events-none',
                  (absence && !isAbsenceStart) && 'opacity-0 pointer-events-none'
                )}>
                  {isStart && apt && (
                    <div 
                      className={cn(
                        'h-full rounded-lg p-3 text-white transition-all',
                        dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                        isDragging && 'opacity-50 ring-2 ring-primary'
                      )}
                      style={{ 
                        backgroundColor: color,
                        minHeight: `${slotsSpan * 50 - 8}px`
                      }}
                      draggable={dragAndDropEnabled}
                      onDragStart={(e) => handleDragStart(e, apt)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAppointmentClick(apt);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          {dragAndDropEnabled && (
                            <GripVertical className="h-4 w-4 opacity-60 flex-shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold">{apt.client?.name}</p>
                              {clientCreditsMap?.get(apt.client_id)?.totalCredits ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Gift className="h-3.5 w-3.5 text-green-300 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      <p className="font-medium text-sm">Créditos disponíveis:</p>
                                      <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availablePackageSessions || 0} sessões de pacote</p>
                                      <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availableServices || 0} serviços pagos</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}
                            </div>
                            <p className="text-sm opacity-90">{apt.service?.name}</p>
                          </div>
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
                  {isAbsenceStart && absence && !apt && (
                    <div 
                      className="h-full rounded-lg p-3 bg-amber-500/20 border-2 border-amber-500/60 cursor-pointer hover:bg-amber-500/30 transition-colors"
                      style={{ minHeight: `${absenceSlotsSpan * 50 - 8}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbsenceClick(absence);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-amber-600" />
                        <div>
                          <p className="font-semibold text-amber-700 dark:text-amber-400">Ausência</p>
                          <p className="text-sm text-amber-600/80 dark:text-amber-300/80">
                            {absenceProf?.name || absence.professional?.name}
                          </p>
                          {absence.reason && (
                            <p className="text-xs text-amber-600/70 dark:text-amber-300/70 mt-1">{absence.reason}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {!apt && !absence && (
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
                const absence = getAbsenceAtSlot(day, time);
                const isStart = apt && format(new Date(apt.start_time), 'HH:mm') === time;
                const isAbsenceStart = absence && format(new Date(absence.start_time), 'HH:mm') === time;
                const profId = apt?.professional_id || apt?.service?.professional_id;
                const prof = professionals.find(p => p.id === profId);
                const color = prof?.agenda_color || '#3B82F6';
                const isDragging = draggedAppointment?.id === apt?.id;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'rounded border border-dashed border-border/50 min-h-[40px] cursor-pointer transition-all',
                      (apt && !isStart) && 'opacity-0 pointer-events-none',
                      (absence && !isAbsenceStart && !apt) && 'opacity-0 pointer-events-none',
                      !apt && !absence && 'hover:bg-muted/30 hover:border-primary/30',
                      draggedAppointment && !apt && !absence && 'bg-primary/5 border-primary/30'
                    )}
                    onClick={() => !draggedAppointment && !absence && handleSlotClick(day, time)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day, time)}
                  >
                    {isStart && apt && (
                      <div 
                        className={cn(
                          'h-full rounded p-1 text-white text-xs transition-all',
                          dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                          isDragging && 'opacity-50 ring-2 ring-primary'
                        )}
                        style={{ backgroundColor: color }}
                        draggable={dragAndDropEnabled}
                        onDragStart={(e) => handleDragStart(e, apt)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAppointmentClick(apt);
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <p className="font-medium truncate">{apt.client?.name}</p>
                          {clientCreditsMap?.get(apt.client_id)?.totalCredits ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Gift className="h-3 w-3 text-green-300 flex-shrink-0 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[200px]">
                                  <p className="font-medium text-sm">Créditos disponíveis:</p>
                                  <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availablePackageSessions || 0} sessões de pacote</p>
                                  <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availableServices || 0} serviços pagos</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
                        </div>
                        <p className="truncate opacity-80">{apt.service?.name}</p>
                      </div>
                    )}
                    {isAbsenceStart && absence && !apt && (
                      <div 
                        className="h-full rounded p-1 bg-amber-500/20 border border-amber-500/50 text-xs cursor-pointer hover:bg-amber-500/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbsenceClick(absence);
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <UserX className="h-3 w-3 text-amber-600" />
                          <span className="text-amber-700 dark:text-amber-400 font-medium truncate">Ausência</span>
                        </div>
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

  // Render professional view (columns per professional)
  const renderProfessionalView = () => {
    const professionalsToShow = activeProfessionals;
    
    return (
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

        {/* Professional columns header */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `64px repeat(${professionalsToShow.length}, 1fr)` }}>
          <div className="w-16" />
          {professionalsToShow.map(prof => (
            <div 
              key={prof.id}
              className="flex flex-col items-center rounded-lg p-2 text-center"
              style={{ borderBottom: `3px solid ${prof.agenda_color || '#3B82F6'}` }}
            >
              <span className="font-medium text-sm truncate w-full">{prof.name}</span>
            </div>
          ))}
        </div>

        {/* Time slots grid */}
        <ScrollArea className="h-[500px]">
          <div className="space-y-0.5">
            {timeSlots.map(time => (
              <div 
                key={time} 
                className="grid gap-1" 
                style={{ gridTemplateColumns: `64px repeat(${professionalsToShow.length}, 1fr)` }}
              >
                <div className="w-16 flex items-center justify-center text-xs font-medium text-muted-foreground">
                  {time}
                </div>
                {professionalsToShow.map(prof => {
                  const apt = filteredByFilters.find(a => {
                    const aptDate = new Date(a.start_time);
                    const aptProfId = a.professional_id || a.service?.professional_id;
                    const [hours, minutes] = time.split(':').map(Number);
                    return isSameDay(aptDate, selectedDate) && 
                           aptDate.getHours() === hours && 
                           aptDate.getMinutes() === minutes &&
                           aptProfId === prof.id;
                  });
                  
                  const occupyingApt = filteredByFilters.find(a => {
                    const aptStart = new Date(a.start_time);
                    const aptEnd = new Date(a.end_time);
                    const aptProfId = a.professional_id || a.service?.professional_id;
                    const [hours, minutes] = time.split(':').map(Number);
                    const slotTime = new Date(selectedDate);
                    slotTime.setHours(hours, minutes, 0, 0);
                    return isSameDay(aptStart, selectedDate) && 
                           slotTime >= aptStart && 
                           slotTime < aptEnd &&
                           aptProfId === prof.id;
                  });
                  
                  const isOccupied = occupyingApt && !apt;
                  const isDragging = draggedAppointment?.id === apt?.id;

                  return (
                    <div
                      key={prof.id}
                      className={cn(
                        'rounded border border-dashed border-border/50 min-h-[40px] cursor-pointer transition-all',
                        isOccupied && 'opacity-0 pointer-events-none',
                        !occupyingApt && 'hover:bg-muted/30 hover:border-primary/30',
                        draggedAppointment && !apt && !isOccupied && 'bg-primary/5 border-primary/30'
                      )}
                      onClick={() => {
                        if (draggedAppointment) return;
                        if (apt) {
                          handleAppointmentClick(apt);
                        } else if (!isOccupied) {
                          setPrefilledDate(selectedDate);
                          setPrefilledTime(time);
                          setNewAppointmentDialogOpen(true);
                        }
                      }}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, selectedDate, time)}
                    >
                      {apt && (
                        <div 
                          className={cn(
                            'h-full rounded p-1 text-white text-xs transition-all',
                            dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                            isDragging && 'opacity-50 ring-2 ring-primary'
                          )}
                          style={{ backgroundColor: prof.agenda_color || '#3B82F6' }}
                          draggable={dragAndDropEnabled}
                          onDragStart={(e) => handleDragStart(e, apt)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAppointmentClick(apt);
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <p className="font-medium truncate">{apt.client?.name}</p>
                            {clientCreditsMap?.get(apt.client_id)?.totalCredits ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Gift className="h-3 w-3 text-green-300 flex-shrink-0 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[200px]">
                                    <p className="font-medium text-sm">Créditos disponíveis:</p>
                                    <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availablePackageSessions || 0} sessões de pacote</p>
                                    <p className="text-xs">{clientCreditsMap.get(apt.client_id)?.availableServices || 0} serviços pagos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </div>
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
  };

  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      {/* Cash Register Status Alert */}
      {currentOpenRegister && (
        <Alert className="mb-4 border-green-500/50 bg-green-500/10">
          <Wallet className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            <span className="font-medium">Caixa aberto</span> desde {format(new Date(currentOpenRegister.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </AlertDescription>
        </Alert>
      )}

      {/* Compact Header with Search, View Toggle and Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar cliente, serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 pl-9"
          />
        </div>

        {/* View Toggle */}
        <ToggleGroup type="single" value={viewType} onValueChange={(v) => v && setViewType(v as ViewType)} className="h-9">
          <ToggleGroupItem value="day" aria-label="Ver dia" className="px-2 text-xs">
            <List className="h-3.5 w-3.5 mr-1" />
            Dia
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Ver semana" className="px-2 text-xs">
            <LayoutGrid className="h-3.5 w-3.5 mr-1" />
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Ver mês" className="px-2 text-xs">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" />
            Mês
          </ToggleGroupItem>
          <ToggleGroupItem value="professional" aria-label="Ver por profissional" className="px-2 text-xs">
            <User className="h-3.5 w-3.5 mr-1" />
            Profissional
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Compact Filters Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1">
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {[professionalFilter !== 'all', roomFilter !== 'all', equipmentFilter !== 'all'].filter(Boolean).length}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Profissional
                </label>
                <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {activeProfessionals.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        <div className="flex items-center gap-2">
                          {prof.agenda_color && (
                            <div 
                              className="h-2.5 w-2.5 rounded-full" 
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

              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Sala
                </label>
                <Select value={roomFilter} onValueChange={setRoomFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {activeRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  Equipamento
                </label>
                <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {activeEquipment.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter: Show only clients with credits */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer" htmlFor="credits-filter">
                  <Gift className="h-3.5 w-3.5 text-green-500" />
                  Clientes com créditos
                </Label>
                <Switch
                  id="credits-filter"
                  checked={showOnlyWithCredits}
                  onCheckedChange={setShowOnlyWithCredits}
                />
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full h-8 text-xs">
                  Limpar filtros
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Absence Button */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleOpenNewAbsence}
          className="h-9 gap-1"
        >
          <UserX className="h-3.5 w-3.5" />
          Ausência
        </Button>
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
            {(viewType === 'week' || viewType === 'month') && (
              <Button size="sm" onClick={handleNewAppointment}>
                <Plus className="h-4 w-4 mr-1" />
                Novo
              </Button>
            )}
          </div>
        </div>

        {/* Calendar Views */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-muted animate-spin border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Carregando agenda...</p>
            <div className="w-full max-w-md space-y-3">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <div className="grid grid-cols-7 gap-2 pt-4">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {viewType === 'day' && renderTimeSlotDayView()}
            {viewType === 'week' && renderWeekView()}
            {viewType === 'month' && renderMonthView()}
            {viewType === 'professional' && renderProfessionalView()}
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

      {/* Move Confirmation Dialog */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && cancelMove()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de horário</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {pendingMove && (
                <>
                  <p>
                    Deseja mover o agendamento de <strong>{pendingMove.appointment.client?.name}</strong> ({pendingMove.appointment.service?.name})?
                  </p>
                  <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
                    <p><strong>De:</strong> {format(new Date(pendingMove.appointment.start_time), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
                    <p><strong>Para:</strong> {format(pendingMove.newStartTime, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelMove}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Professional Absence Dialog */}
      <ProfessionalAbsenceDialog
        professionals={professionals}
        open={absenceDialogOpen}
        onOpenChange={(open) => {
          setAbsenceDialogOpen(open);
          if (!open) setEditingAbsence(null);
        }}
        prefilledDate={selectedDate}
        editingAbsence={editingAbsence}
      />
    </AppLayout>
  );
};

export default Agenda;
