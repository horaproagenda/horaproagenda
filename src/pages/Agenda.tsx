import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  User, 
  Calendar as CalendarIcon,
  LayoutGrid,
  List,
  Plus,
  GripVertical,
  UserX,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  TrendingUp,
  DollarSign,
  Flame,
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
import { useAutoCompleteAppointments } from '@/hooks/useAutoCompleteAppointments';
import { useCardBrands } from '@/hooks/useCardBrands';
import { Skeleton } from '@/components/ui/skeleton';
import { Appointment, PaymentStatus } from '@/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ViewType = 'day' | 'week' | 'month' | 'professional';

// Animation variants for view transitions
const viewVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
};

const Agenda = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [viewType, setViewType] = useState<ViewType>('week');
  const [prevViewType, setPrevViewType] = useState<ViewType>('week');
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

  // Track view changes for animation direction
  useEffect(() => {
    if (viewType !== prevViewType) {
      setPrevViewType(viewType);
    }
  }, [viewType, prevViewType]);

  const { appointments, isLoading: isLoadingAppointments, updatePayment, updateAppointment } = useAppointments();
  const { professionals, isLoading: isLoadingProfessionals } = useProfessionals();
  const { rooms, isLoading: isLoadingRooms } = useRooms();
  const { equipment, isLoading: isLoadingEquipment } = useEquipment();
  const { settings, generateTimeSlots, isLoading: isLoadingSettings } = useBusinessSettings();
  const { absences, isLoading: isLoadingAbsences } = useProfessionalAbsences();
  const { activeCardBrands } = useCardBrands();
  
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

  // Filter appointments by search, professional, room, status and payment
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
      if (statusFilter !== 'all') {
        if (apt.status !== statusFilter) {
          return false;
        }
      }
      if (paymentFilter !== 'all') {
        if (apt.payment_status !== paymentFilter) {
          return false;
        }
      }
      
      return true;
    });
  }, [appointments, searchTerm, professionalFilter, roomFilter, statusFilter, paymentFilter]);

  // Filter by selected date (for day view)
  const filteredAppointments = useMemo(() => {
    return filteredByFilters.filter(
      apt => isSameDay(new Date(apt.start_time), selectedDate)
    ).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [filteredByFilters, selectedDate]);

  // Day statistics for summary
  const dayStats = useMemo(() => {
    const currentView = viewType === 'day' || viewType === 'professional' ? selectedDate : new Date();
    const dayApts = filteredByFilters.filter(apt => isSameDay(new Date(apt.start_time), currentView));
    
    return {
      total: dayApts.length,
      confirmed: dayApts.filter(a => a.status === 'confirmed' || a.status === 'completed').length,
      pending: dayApts.filter(a => a.status === 'scheduled').length,
      cancelled: dayApts.filter(a => a.status === 'cancelled' || a.status === 'missed').length,
    };
  }, [filteredByFilters, selectedDate, viewType]);

  // Week statistics
  const weekStats = useMemo(() => {
    const weekApts = filteredByFilters.filter(apt => {
      const aptDate = new Date(apt.start_time);
      return weekDays.some(day => isSameDay(aptDate, day));
    });
    
    return {
      total: weekApts.length,
      confirmed: weekApts.filter(a => a.status === 'confirmed' || a.status === 'completed').length,
      pending: weekApts.filter(a => a.status === 'scheduled').length,
      cancelled: weekApts.filter(a => a.status === 'cancelled' || a.status === 'missed').length,
      revenue: weekApts.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + (a.service?.price || 0), 0),
    };
  }, [filteredByFilters, weekDays]);

  // Month statistics
  const monthStats = useMemo(() => {
    const monthApts = filteredByFilters.filter(apt => {
      const aptDate = new Date(apt.start_time);
      return isSameMonth(aptDate, monthStart);
    });
    
    return {
      total: monthApts.length,
      confirmed: monthApts.filter(a => a.status === 'confirmed' || a.status === 'completed').length,
      pending: monthApts.filter(a => a.status === 'scheduled').length,
      cancelled: monthApts.filter(a => a.status === 'cancelled' || a.status === 'missed').length,
      revenue: monthApts.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + (a.service?.price || 0), 0),
    };
  }, [filteredByFilters, monthStart]);

  // Peak hours analysis - based on historical data
  const peakHoursMap = useMemo(() => {
    const hourCounts: Record<string, number> = {};
    
    // Count appointments per hour across all history
    appointments.forEach(apt => {
      const hour = format(new Date(apt.start_time), 'HH:00');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    // Find max count to calculate intensity
    const maxCount = Math.max(...Object.values(hourCounts), 1);
    
    // Calculate intensity (0-3) for each hour
    const intensityMap: Record<string, number> = {};
    Object.entries(hourCounts).forEach(([hour, count]) => {
      const ratio = count / maxCount;
      if (ratio >= 0.75) intensityMap[hour] = 3; // High peak
      else if (ratio >= 0.5) intensityMap[hour] = 2; // Medium peak
      else if (ratio >= 0.25) intensityMap[hour] = 1; // Low peak
      else intensityMap[hour] = 0;
    });
    
    return intensityMap;
  }, [appointments]);

  // Get peak indicator style for a time slot
  const getPeakIndicator = (time: string) => {
    const hour = time.split(':')[0] + ':00';
    const intensity = peakHoursMap[hour] || 0;
    
    switch (intensity) {
      case 3: return { bg: 'bg-primary/20', border: 'border-primary/40', label: 'Alto' };
      case 2: return { bg: 'bg-warning/15', border: 'border-warning/30', label: 'Médio' };
      case 1: return { bg: 'bg-info/10', border: 'border-info/20', label: 'Baixo' };
      default: return null;
    }
  };

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
    setStatusFilter('all');
    setPaymentFilter('all');
  };

  const hasActiveFilters = professionalFilter !== 'all' || roomFilter !== 'all' || equipmentFilter !== 'all' || statusFilter !== 'all' || paymentFilter !== 'all';
  const activeFiltersCount = [professionalFilter !== 'all', roomFilter !== 'all', equipmentFilter !== 'all', statusFilter !== 'all', paymentFilter !== 'all'].filter(Boolean).length;

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

  const handlePayment = (
    appointmentId: string, 
    paymentMethods: { method: string; amount: number; cardBrandId?: string; installments?: number }[], 
    clientCredit?: number, // Saldo: troco real registrado no caixa/financeiro
    courtesyCredit?: number, // Cortesia: brinde sem entrada financeira
    cashRegisterId?: string,
    usedClientCredit?: number
  ) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    // Calculate the correct total price based on appointment type
    const isPackageAppointment = !!appointment.package_appointment;
    const packageData = appointment.package_appointment?.package;
    
    // For package appointments, use the FULL package price, not per session
    const totalPrice = isPackageAppointment 
      ? (packageData?.total_price || 0)
      : (appointment.service?.price || 0);

    const paymentTotal = paymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const saldoToAdd = clientCredit || 0; // Saldo: real money as credit (registered in cash/financial)
    const courtesyToAdd = courtesyCredit || 0; // Cortesia: gift without financial entry
    const creditUsed = usedClientCredit || 0;
    const totalPaid = (appointment.amount_paid || 0) + paymentTotal + saldoToAdd + courtesyToAdd + creditUsed;
    const existingMethods = appointment.payment_methods || [];
    const newMethods = [...new Set([...existingMethods, ...paymentMethods.map(p => p.method)])];
    
    // Calculate total card fees from payments
    let totalCardFee = 0;
    let primaryInstallments = 1;
    paymentMethods.forEach(p => {
      if (p.cardBrandId && p.amount > 0) {
        const cardBrand = activeCardBrands.find(b => b.id === p.cardBrandId);
        if (cardBrand) {
          const fees = cardBrand.fees || [];
          const installments = p.installments || 1;
          const sortedFees = [...fees].sort((a, b) => b.installment_number - a.installment_number);
          const matchingFee = sortedFees.find(f => f.installment_number <= installments);
          const feePercentage = matchingFee?.fee_percentage || 0;
          const feeAmount = (p.amount * feePercentage) / 100;
          
          // Only count fee if it's deducted from provider
          if (cardBrand.fee_behavior === 'deduct_from_provider') {
            totalCardFee += feeAmount;
          }
          
          if (installments > primaryInstallments) {
            primaryInstallments = installments;
          }
        }
      }
    });
    
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
        client_credit: saldoToAdd > 0 ? saldoToAdd : undefined, // Saldo: registered in cash/financial
        courtesy_credit: courtesyToAdd > 0 ? courtesyToAdd : undefined, // Cortesia: NOT registered in cash/financial
        used_client_credit: creditUsed > 0 ? creditUsed : undefined,
        client_id: appointment.client_id,
        cash_register_id: cashRegisterId,
        card_fee_amount: totalCardFee > 0 ? totalCardFee : undefined,
        installments: primaryInstallments > 1 ? primaryInstallments : undefined,
      },
    });
  };

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

  // Render time slot grid for day view - Clean and compact
  const renderTimeSlotDayView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <Button onClick={handleNewAppointment} size="sm" className="h-7 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Novo
        </Button>
      </div>
      
      <ScrollArea className="h-[520px]">
        <div className="space-y-0.5">
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

            // Peak hour indicator
            const peakIndicator = getPeakIndicator(time);

            return (
              <div
                key={time}
                className={cn(
                  'flex items-stretch gap-2 min-h-[42px] rounded-lg transition-all',
                  apt ? '' : absence ? '' : 'hover:bg-muted/30 cursor-pointer',
                  draggedAppointment && !apt && !absence && 'bg-primary/5 border border-dashed border-primary/20'
                )}
                onClick={() => !draggedAppointment && !absence && handleSlotClick(selectedDate, time)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, selectedDate, time)}
              >
                <div className="w-12 flex-shrink-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">{time}</span>
                  {peakIndicator && (
                    <div className={cn('h-1 w-6 rounded-full mt-0.5', peakIndicator.bg)} title={`Horário ${peakIndicator.label}`} />
                  )}
                </div>
                <div className={cn(
                  'flex-1 rounded-lg border border-dashed p-1.5 min-h-[42px]',
                  peakIndicator ? cn(peakIndicator.bg, peakIndicator.border) : 'border-border/40',
                  (apt && !isStart) && 'opacity-0 pointer-events-none',
                  (absence && !isAbsenceStart) && 'opacity-0 pointer-events-none'
                )}>
                  {isStart && apt && (
                    <div 
                      className={cn(
                        'h-full rounded-lg p-2.5 transition-all shadow-sm',
                        dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                        isDragging && 'opacity-50 ring-2 ring-primary'
                      )}
                      style={{ 
                        backgroundColor: `${color}15`,
                        borderLeft: `3px solid ${color}`,
                        minHeight: `${slotsSpan * 42 - 6}px`
                      }}
                      draggable={dragAndDropEnabled}
                      onDragStart={(e) => handleDragStart(e, apt)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAppointmentClick(apt);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0 flex-1">
                          {dragAndDropEnabled && (
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{apt.client?.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{apt.service?.name}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] font-medium text-foreground">R$ {apt.service?.price.toFixed(2)}</p>
                          <Badge 
                            variant={apt.payment_status === 'paid' ? 'default' : apt.payment_status === 'partial' ? 'secondary' : 'outline'} 
                            className="text-[9px] h-4 px-1"
                          >
                            {apt.payment_status === 'paid' ? 'Pago' : apt.payment_status === 'partial' ? 'Parcial' : 'Pend.'}
                          </Badge>
                        </div>
                      </div>
                      {prof && (
                        <p className="text-[10px] mt-1 text-muted-foreground truncate">{prof.name}</p>
                      )}
                    </div>
                  )}
                  {isAbsenceStart && absence && !apt && (
                    <div 
                      className="h-full rounded-lg p-2.5 bg-amber-50 dark:bg-amber-900/20 border-l-3 border-amber-500 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      style={{ minHeight: `${absenceSlotsSpan * 42 - 6}px`, borderLeftWidth: '3px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbsenceClick(absence);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserX className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ausência</p>
                          <p className="text-[11px] text-amber-600/80 dark:text-amber-300/80 truncate">
                            {absenceProf?.name || absence.professional?.name}
                          </p>
                          {absence.reason && (
                            <p className="text-[10px] text-amber-600/70 dark:text-amber-300/70 mt-0.5 truncate">{absence.reason}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {!apt && !absence && (
                    <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-muted-foreground" />
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
                        <p className="font-medium truncate">{apt.client?.name}</p>
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
  };

  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      {/* Clean Header Layout */}
      <div className="space-y-2 mb-3">
        {/* Row 1: Search + Filter + Absence */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar cliente, serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          
          <div className="flex-1" />

          {/* Unified Filter Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 gap-1">
                <Filter className="h-3 w-3" />
                <span className="text-[11px]">Filtros</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-foreground">Filtros</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-[10px] gap-1">
                    <X className="h-3 w-3" />
                    Limpar
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Profissional</label>
                  <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {activeProfessionals.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          <div className="flex items-center gap-1.5">
                            {prof.agenda_color && (
                              <div 
                                className="h-2 w-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: prof.agenda_color }}
                              />
                            )}
                            <span className="truncate text-xs">{prof.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Sala</label>
                  <Select value={roomFilter} onValueChange={setRoomFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {activeRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          <span className="text-xs">{room.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="scheduled">Agendado</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                      <SelectItem value="missed">Faltou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pagamento</label>
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="partial">Parcial</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Equipamento</label>
                  <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {activeEquipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          <span className="text-xs">{eq.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Absence Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleOpenNewAbsence}
            className="h-7 px-2 gap-1"
          >
            <UserX className="h-3 w-3" />
            <span className="text-[11px]">Ausência</span>
          </Button>
        </div>

        {/* Row 2: View Toggle */}
        <ToggleGroup type="single" value={viewType} onValueChange={(v) => v && setViewType(v as ViewType)} className="justify-start gap-0.5">
          <ToggleGroupItem value="day" aria-label="Ver dia" className="h-6 px-2.5 text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <List className="h-3 w-3" />
            <span>Dia</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Ver semana" className="h-6 px-2.5 text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <LayoutGrid className="h-3 w-3" />
            <span>Semana</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Ver mês" className="h-6 px-2.5 text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <CalendarIcon className="h-3 w-3" />
            <span>Mês</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="professional" aria-label="Ver por profissional" className="h-6 px-2.5 text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <User className="h-3 w-3" />
            <span>Prof.</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Navigation */}
      <div className="rounded-xl border border-border/50 bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={goToPrevious} className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNext} className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1.5 text-sm font-medium text-foreground capitalize">
              {getNavigationLabel()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={goToToday} className="h-7 text-xs px-2.5">
              Hoje
            </Button>
            {(viewType === 'week' || viewType === 'month') && (
              <Button size="sm" onClick={handleNewAppointment} className="h-7 text-xs px-2.5">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Novo
              </Button>
            )}
          </div>
        </div>

        {/* Calendar Views with Animation */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-4 border-muted animate-spin border-t-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Carregando agenda...</p>
            <div className="w-full max-w-md space-y-2">
              <Skeleton className="h-3 w-3/4 mx-auto" />
              <Skeleton className="h-3 w-1/2 mx-auto" />
              <div className="grid grid-cols-7 gap-1.5 pt-3">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={viewType}
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {viewType === 'day' && renderTimeSlotDayView()}
              {viewType === 'week' && renderWeekView()}
              {viewType === 'month' && renderMonthView()}
              {viewType === 'professional' && renderProfessionalView()}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Summary Stats - All Views */}
        {!isLoading && (
          <motion.div 
            key={`summary-${viewType}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 pt-3 border-t border-border/50"
          >
            {/* Day/Professional View Summary */}
            {(viewType === 'day' || viewType === 'professional') && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center">
                      <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-foreground">{dayStats.total}</span>
                      <span className="text-muted-foreground ml-1">total</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-success">{dayStats.confirmed}</span>
                      <span className="text-muted-foreground ml-1">confirm.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-warning/10 flex items-center justify-center">
                      <Clock className="h-3 w-3 text-warning" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-warning">{dayStats.pending}</span>
                      <span className="text-muted-foreground ml-1">pend.</span>
                    </div>
                  </div>
                  {dayStats.cancelled > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-destructive">{dayStats.cancelled}</span>
                        <span className="text-muted-foreground ml-1">canc.</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {Object.values(peakHoursMap).some(v => v >= 2) && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Flame className="h-3 w-3 text-primary" />
                      <span>Pico</span>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            )}

            {/* Week View Summary */}
            {viewType === 'week' && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center">
                      <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-foreground">{weekStats.total}</span>
                      <span className="text-muted-foreground ml-1">total</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-success">{weekStats.confirmed}</span>
                      <span className="text-muted-foreground ml-1">confirm.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-warning/10 flex items-center justify-center">
                      <Clock className="h-3 w-3 text-warning" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-warning">{weekStats.pending}</span>
                      <span className="text-muted-foreground ml-1">pend.</span>
                    </div>
                  </div>
                  {weekStats.cancelled > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-destructive">{weekStats.cancelled}</span>
                        <span className="text-muted-foreground ml-1">canc.</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <DollarSign className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-primary">R$ {weekStats.revenue.toFixed(0)}</span>
                      <span className="text-muted-foreground ml-1">recebido</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Semana de {format(weekStart, "dd/MM", { locale: ptBR })}
                </span>
              </div>
            )}

            {/* Month View Summary */}
            {viewType === 'month' && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center">
                      <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-foreground">{monthStats.total}</span>
                      <span className="text-muted-foreground ml-1">total</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-success">{monthStats.confirmed}</span>
                      <span className="text-muted-foreground ml-1">confirm.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-warning/10 flex items-center justify-center">
                      <Clock className="h-3 w-3 text-warning" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-warning">{monthStats.pending}</span>
                      <span className="text-muted-foreground ml-1">pend.</span>
                    </div>
                  </div>
                  {monthStats.cancelled > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-destructive">{monthStats.cancelled}</span>
                        <span className="text-muted-foreground ml-1">canc.</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <DollarSign className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-primary">R$ {monthStats.revenue.toFixed(0)}</span>
                      <span className="text-muted-foreground ml-1">recebido</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-info/10 flex items-center justify-center">
                      <TrendingUp className="h-3 w-3 text-info" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-info">{monthStats.total > 0 ? (monthStats.confirmed / monthStats.total * 100).toFixed(0) : 0}%</span>
                      <span className="text-muted-foreground ml-1">taxa</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {format(monthStart, "MMMM yyyy", { locale: ptBR })}
                </span>
              </div>
            )}
          </motion.div>
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
