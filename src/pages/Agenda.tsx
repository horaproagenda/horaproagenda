import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
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
  getYear,
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
  Download,
  Upload,
  MoreHorizontal,
  Umbrella,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LiveCashTotalsBar } from '@/components/shared/LiveCashTotalsBar';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { AppointmentDetailDialog } from '@/components/appointments/AppointmentDetailDialog';
import { NewAppointmentDialog } from '@/components/appointments/NewAppointmentDialog';
import { ProfessionalAbsenceDialog } from '@/components/appointments/ProfessionalAbsenceDialog';
import { ImportAppointmentsDialog } from '@/components/appointments/ImportAppointmentsDialog';
import { AbsenceManagementPanel } from '@/components/agenda/AbsenceManagementPanel';
import { MobileAgendaList } from '@/components/agenda/MobileAgendaList';
import { MobileAgendaHeader, type MobileViewType } from '@/components/agenda/MobileAgendaHeader';
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
import { cn, formatCurrency } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useLogAccessOnMount, logAccess } from '@/hooks/useLogAccess';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { useClientsCredits } from '@/hooks/useClientCredits';
import { useAutoCompleteAppointments } from '@/hooks/useAutoCompleteAppointments';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useBrazilianHolidays } from '@/hooks/useBrazilianHolidays';
import { useIsSmartphone } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Appointment, PaymentStatus } from '@/types';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { exportToCSV } from '@/lib/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AgendaAutomationPanel } from '@/components/agenda/AgendaAutomationPanel';

import { mergeAgendaTimeSlots } from '@/lib/agendaSlots';
import { getAppointmentStatusConfig, getAppointmentStatusStyle } from '@/lib/appointmentStatus';
import { buildAppointmentPackageSequenceMap, getAppointmentPackageApplicationLabel } from '@/lib/packageSequence';
import { isClientCreditPaymentMethod, CLIENT_CREDIT_SOURCE_LABEL, NON_CASH_PAYMENT_LABEL } from '@/lib/clientCreditPayment';
import { shouldKeepAppointmentVisibleInAgenda } from '@/lib/packageAvailability';
import { AgendaFiltersContent } from '@/components/agenda/AgendaFiltersContent';

type ViewType = 'day' | 'week' | 'month' | 'professional';

// Animation variants for view transitions
const viewVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
};

const Agenda = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useLogAccessOnMount({
    module: 'agenda',
    action: 'view',
    fieldsViewed: [
      'scheduled_date', 'scheduled_time', 'duration', 'status', 'payment_status',
      'client_name', 'client_phone', 'professional_name', 'service_name',
      'service_price', 'room_name', 'equipment_name', 'observations',
    ],
    metadata: { route: '/agenda' },
  });
  const [searchTerm, setSearchTerm] = useLocalStorage<string>('agenda:searchTerm', '');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [professionalFilter, setProfessionalFilter] = useState<string>(() => {
    return localStorage.getItem('agenda-filter-professional') || 'all';
  });
  const [roomFilter, setRoomFilter] = useState<string>(() => {
    return localStorage.getItem('agenda-filter-room') || 'all';
  });
  const [equipmentFilter, setEquipmentFilter] = useState<string>(() => {
    return localStorage.getItem('agenda-filter-equipment') || 'all';
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    return localStorage.getItem('agenda-filter-status') || 'all';
  });
  const [paymentFilter, setPaymentFilter] = useState<string>(() => {
    return localStorage.getItem('agenda-filter-payment') || 'all';
  });
  const [viewType, setViewType] = useState<ViewType>(() => {
    return (localStorage.getItem('agenda-view-type') as ViewType) || 'week';
  });
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
  const [editingAbsence, setEditingAbsence] = useState<any>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [showMobileAbsencePanel, setShowMobileAbsencePanel] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileView, setMobileView] = useState<MobileViewType>('day');
  
  // Detect true smartphone for optimized mobile layout
  const isSmartphone = useIsSmartphone();

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
  const { settings, generateTimeSlotsForDay, isLoading: isLoadingSettings } = useBusinessSettings();
  const { absences, isLoading: isLoadingAbsences } = useProfessionalAbsences();
  const { activeCardBrands } = useCardBrands();
  const { getHolidayForDate, isHolidayDate } = useBrazilianHolidays();

  useEffect(() => {
    if (appointments.length === 0) return;

    // Handle location.state deep link
    const state = location.state as { openAppointmentId?: string; appointmentDate?: string } | null;
    if (state?.openAppointmentId) {
      const appointmentToReopen = appointments.find((apt) => apt.id === state.openAppointmentId);
      if (appointmentToReopen) {
        setSelectedAppointment(appointmentToReopen);
        setDetailDialogOpen(true);
        setSelectedDate(new Date(state.appointmentDate || appointmentToReopen.start_time));
        navigate('/agenda', { replace: true, state: null });
        return;
      }
    }

    // Handle ?appointment=ID query param (from Caixa/Financeiro "Pagar" buttons)
    const params = new URLSearchParams(location.search);
    const appointmentId = params.get('appointment');
    if (appointmentId) {
      const apt = appointments.find((a) => a.id === appointmentId);
      if (apt) {
        setSelectedAppointment(apt);
        setDetailDialogOpen(true);
        setSelectedDate(new Date(apt.start_time));
      }
      // Clean up URL param
      navigate('/agenda', { replace: true });
    }
  }, [appointments, location.state, location.search, navigate]);

  useEffect(() => {
    if (!selectedAppointment) return;
    const latestAppointment = appointments.find((apt) => apt.id === selectedAppointment.id);
    if (latestAppointment && latestAppointment.updated_at !== selectedAppointment.updated_at) {
      setSelectedAppointment(latestAppointment);
    }
    if (!latestAppointment && detailDialogOpen) {
      setDetailDialogOpen(false);
      setSelectedAppointment(null);
    }
  }, [appointments, detailDialogOpen, selectedAppointment]);
  
  // Auto-complete appointments when setting is enabled
  useAutoCompleteAppointments();
  
  // WhatsApp reminders are dispatched automatically by the server-side cron
  // (see edge function send-appointment-reminders, running every 5 minutes).

  // Get unique client IDs from appointments and fetch their credits
  const clientIds = useMemo(() => {
    const ids = appointments.map(apt => apt.client_id).filter(Boolean);
    return [...new Set(ids)];
  }, [appointments]);
  
  const { data: clientCreditsMap } = useClientsCredits(clientIds);

  const isLoading = isLoadingAppointments || isLoadingProfessionals || isLoadingRooms || isLoadingSettings || isLoadingEquipment || isLoadingAbsences;
  const dragAndDropEnabled = settings?.drag_and_drop_enabled ?? true;

  // Hide Sunday toggle state
  const [hideSunday, setHideSunday] = useState(() => {
    const stored = localStorage.getItem('agenda-hide-sunday');
    return stored ? JSON.parse(stored) : false;
  });

  const saveHideSunday = (value: boolean) => {
    setHideSunday(value);
    localStorage.setItem('agenda-hide-sunday', JSON.stringify(value));
  };

  const baseTimeSlots = useMemo(() => {
    const slots = new Set<string>();
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      generateTimeSlotsForDay(dayOfWeek).forEach((slot) => slots.add(slot));
    }
    return Array.from(slots).sort((a, b) => a.localeCompare(b));
  }, [settings, generateTimeSlotsForDay]);
  
  // Merge base slots with any appointment times that fall outside the base slots
  // CRITICAL: This ensures ALL appointments are visible regardless of their start time
  const timeSlots = useMemo(() => {
    return mergeAgendaTimeSlots({
      baseSlots: baseTimeSlots,
      appointments,
      absences,
      viewType,
      selectedDate,
      weekStart,
      monthStart,
      hideSunday,
    });
  }, [baseTimeSlots, appointments, absences, viewType, weekStart, monthStart, selectedDate, hideSunday]);

  const weekDays = useMemo(() => {
    const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    if (hideSunday) {
      return allDays.filter(day => getDay(day) !== 0); // 0 = Sunday
    }
    return allDays;
  }, [weekStart, hideSunday]);

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
    
    let allDays = [...prevMonthDays, ...days, ...nextMonthDays];
    if (hideSunday) {
      allDays = allDays.filter(day => getDay(day) !== 0);
    }
    return allDays;
  }, [monthStart, hideSunday]);

  // Filter appointments by search, professional, room, status and payment
  // Keep package-linked sessions visible even when their appointment status was marked as rescheduled,
  // because automatic package shifts preserve the same session instead of releasing it from the agenda.
  const filteredByFilters = useMemo(() => {
    return appointments.filter(apt => {
      // Exclude only standalone released reschedules. Any appointment linked to a package session
      // must remain visible so old packages and sequential package sessions do not disappear.
      if (!shouldKeepAppointmentVisibleInAgenda(apt)) {
        return false;
      }
      
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
        const isClientCredit = (apt.payment_methods || []).some(method => isClientCreditPaymentMethod(method));
        if (paymentFilter === 'client_credit' && !isClientCredit) {
          return false;
        }
        if (paymentFilter === 'non_cash' && !isClientCredit) {
          return false;
        }
        if (!['client_credit', 'non_cash'].includes(paymentFilter) && apt.payment_status !== paymentFilter) {
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

  const packageSequenceMap = useMemo(() => buildAppointmentPackageSequenceMap(appointments), [appointments]);

  const getAppointmentDisplayInfo = useCallback((apt: Appointment) => {
    const packageData = apt.package_appointment?.package;
    const isPackage = Boolean(packageData);
    return {
      title: isPackage ? packageData?.name || apt.service?.name || 'Pacote' : apt.service?.name || 'Serviço',
      applicationLabel: isPackage ? getAppointmentPackageApplicationLabel(apt, packageSequenceMap.get(apt.id)) : null,
    };
  }, [packageSequenceMap]);

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
      return slotStart >= aptStart && slotStart < aptEnd;
    });
  };

  const isVisibleRangeStart = (day: Date, time: string, startTime: string, endTime: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = new Date(day);
    slotStart.setHours(hours, minutes, 0, 0);
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (slotStart < start || slotStart >= end) return false;
    return isSameDay(start, day) ? format(start, 'HH:mm') === time : time === '00:00';
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

  // Check if any professional has a full-day absence for a specific day
  const hasFullDayAbsence = (day: Date) => {
    const dayAbsences = getAbsencesForDay(day);
    return dayAbsences.some(absence => {
      const start = new Date(absence.start_time);
      const end = new Date(absence.end_time);
      // Consider full day if 8+ hours
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return hours >= 8;
    });
  };

  // Get professionals with full-day absences for a specific day
  const getFullDayAbsenceProfessionals = (day: Date) => {
    const dayAbsences = getAbsencesForDay(day);
    return dayAbsences.filter(absence => {
      const start = new Date(absence.start_time);
      const end = new Date(absence.end_time);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return hours >= 8;
    }).map(absence => {
      const prof = professionals.find(p => p.id === absence.professional_id);
      return prof?.name || 'Profissional';
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

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('agenda-filter-professional', professionalFilter);
    localStorage.setItem('agenda-filter-room', roomFilter);
    localStorage.setItem('agenda-filter-equipment', equipmentFilter);
    localStorage.setItem('agenda-filter-status', statusFilter);
    localStorage.setItem('agenda-filter-payment', paymentFilter);
    localStorage.setItem('agenda-view-type', viewType);
  }, [professionalFilter, roomFilter, equipmentFilter, statusFilter, paymentFilter, viewType]);

  const clearFilters = () => {
    setProfessionalFilter('all');
    setRoomFilter('all');
    setEquipmentFilter('all');
    setStatusFilter('all');
    setPaymentFilter('all');
  };

  const hasActiveFilters = professionalFilter !== 'all' || roomFilter !== 'all' || equipmentFilter !== 'all' || statusFilter !== 'all' || paymentFilter !== 'all';
  const activeFiltersCount = [professionalFilter !== 'all', roomFilter !== 'all', equipmentFilter !== 'all', statusFilter !== 'all', paymentFilter !== 'all'].filter(Boolean).length;

  // Export appointments to CSV
  const handleExportAppointments = () => {
    const statusMap: Record<string, string> = {
      scheduled: getAppointmentStatusConfig('scheduled').label,
      confirmed: getAppointmentStatusConfig('confirmed').label,
      completed: getAppointmentStatusConfig('completed').label,
      cancelled: getAppointmentStatusConfig('cancelled').label,
      missed: getAppointmentStatusConfig('missed').label,
      rescheduled: getAppointmentStatusConfig('rescheduled').label,
    };
    
    const paymentMap: Record<string, string> = {
      'pending': 'Pendente',
      'partial': 'Parcial',
      'paid': 'Pago',
    };

    // Get appointments based on current view and filters
    let appointmentsToExport = filteredByFilters;
    
    if (viewType === 'day' || viewType === 'professional') {
      appointmentsToExport = filteredAppointments;
    } else if (viewType === 'week') {
      appointmentsToExport = filteredByFilters.filter(apt => {
        const aptDate = new Date(apt.start_time);
        return weekDays.some(day => isSameDay(aptDate, day));
      });
    } else if (viewType === 'month') {
      appointmentsToExport = filteredByFilters.filter(apt => {
        const aptDate = new Date(apt.start_time);
        return isSameMonth(aptDate, monthStart);
      });
    }

    const exportRows = appointmentsToExport.map(apt => {
      const isClientCredit = (apt.payment_methods || []).some(method => isClientCreditPaymentMethod(method));
      const paymentLabel = isClientCredit ? `${CLIENT_CREDIT_SOURCE_LABEL} / ${NON_CASH_PAYMENT_LABEL}` : paymentMap[apt.payment_status || 'pending'] || apt.payment_status || 'Pendente';
      return [
        format(new Date(apt.start_time), 'dd/MM/yyyy'),
        format(new Date(apt.start_time), 'HH:mm'),
        format(new Date(apt.end_time), 'HH:mm'),
        apt.client?.name || '-',
        apt.client?.phone || '-',
        apt.service?.name || (apt.package_appointment?.package?.name ? `Pacote: ${apt.package_appointment.package.name}` : '-'),
        apt.professional?.name || apt.service?.professional?.name || '-',
        apt.room?.name || apt.service?.room?.name || '-',
        statusMap[apt.status] || apt.status,
        paymentLabel,
        apt.service?.price || apt.package_appointment?.package?.total_price || 0,
        apt.amount_paid || 0,
        apt.notes || '',
      ];
    });

    exportToCSV({
      filename: `agendamentos_${viewType}`,
      headers: [
        'Data',
        'Horário Início',
        'Horário Fim',
        'Cliente',
        'Telefone',
        'Serviço',
        'Profissional',
        'Sala',
        'Status',
        'Pagamento',
        'Valor',
        'Valor Pago',
        'Observações',
      ],
      rows: exportRows,
      successMessage: `${appointmentsToExport.length} agendamentos exportados com sucesso!`,
    });
  };

  const handleExportAppointmentsPDF = () => {
    let appointmentsToExport = filteredByFilters;
    if (viewType === 'day' || viewType === 'professional') appointmentsToExport = filteredAppointments;
    if (viewType === 'week') appointmentsToExport = filteredByFilters.filter(apt => weekDays.some(day => isSameDay(new Date(apt.start_time), day)));
    if (viewType === 'month') appointmentsToExport = filteredByFilters.filter(apt => isSameMonth(new Date(apt.start_time), monthStart));
    const rows = appointmentsToExport.map(apt => {
      const isClientCredit = (apt.payment_methods || []).some(method => isClientCreditPaymentMethod(method));
      return [
        format(new Date(apt.start_time), 'dd/MM/yyyy'),
        format(new Date(apt.start_time), 'HH:mm'),
        apt.client?.name || '-',
        apt.service?.name || apt.package_appointment?.package?.name || '-',
        apt.professional?.name || apt.service?.professional?.name || '-',
        isClientCredit ? `${CLIENT_CREDIT_SOURCE_LABEL} / ${NON_CASH_PAYMENT_LABEL}` : apt.payment_status || 'Pendente',
        `R$ ${Number(apt.amount_paid || 0).toFixed(2)}`,
      ];
    });
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Agenda filtrada', 14, 14);
    doc.setFontSize(9);
    doc.text(`Filtro de pagamento: ${paymentFilter === 'client_credit' ? CLIENT_CREDIT_SOURCE_LABEL : paymentFilter === 'non_cash' ? NON_CASH_PAYMENT_LABEL : paymentFilter}`, 14, 21);
    autoTable(doc, { startY: 28, head: [['Data', 'Hora', 'Cliente', 'Serviço', 'Profissional', 'Pagamento', 'Valor pago']], body: rows, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [41, 98, 255] }, columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 18 }, 5: { cellWidth: 56 }, 6: { halign: 'right' } } });
    doc.save(`agenda_filtrada_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setDetailDialogOpen(true);
  };

  const handleSlotClick = (day: Date, time: string, professionalId?: string) => {
    // Block clicks on closed days
    const dayOfWeek = day.getDay();
    if (dayOfWeek === 0 && !settings?.work_sundays) {
      toast.error('Estabelecimento fechado aos domingos');
      return;
    }
    if (dayOfWeek === 6 && !settings?.work_saturdays) {
      toast.error('Estabelecimento fechado aos sábados');
      return;
    }
    
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
    clientCredit?: number, // Saldo: troco real registrado no caixa/financeiro (excess becomes client credit)
    courtesyCredit?: number, // Cortesia: brinde sem entrada financeira
    cashRegisterId?: string,
    usedClientCredit?: number,
    discountApplied?: number, // Desconto aplicado
    usedClientCreditMethod?: string,
    additionalItems: Array<{
      item_type: 'service' | 'product';
      service_id?: string | null;
      product_id?: string | null;
      quantity: number;
      unit_price: number;
      total_amount: number;
    }> = []
  ) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    // Calculate the correct total price based on appointment type
    const isPackageAppointment = !!appointment.package_appointment;
    const packageData = appointment.package_appointment?.package;
    
    // For package appointments, use the FULL package price, not per session
    const baseTotalPrice = isPackageAppointment 
      ? (packageData?.total_price || 0)
      : (appointment.service?.price || 0);
    const existingAdditionalTotal = (appointment.additional_items || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const newAdditionalTotal = additionalItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const totalPrice = baseTotalPrice + existingAdditionalTotal + newAdditionalTotal;

    const paymentTotal = paymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const saldoToAdd = clientCredit || 0; // Saldo: real money as credit (registered in cash/financial)
    const courtesyToAdd = courtesyCredit || 0; // Cortesia: gift without financial entry
    const creditUsed = usedClientCredit || 0;
    const discount = discountApplied || 0;
    const availableCredit = Number(appointment.client?.credit_balance || 0);
    
    // CRITICAL FIX: Calculate the actual amount to record as paid
    // Apply discount first, then check for overpayment
    const priceAfterDiscount = Math.max(0, totalPrice - discount);
    const existingPaid = isPackageAppointment && appointment.package_appointment?.package_id
      ? Math.max(
          ...appointments
            .filter((item) => item.package_appointment?.package_id === appointment.package_appointment?.package_id)
            .map((item) => Number(item.amount_paid || 0)),
          Number(appointment.amount_paid || 0),
          0
        )
      : Number(appointment.amount_paid || 0);
    const remainingToPay = Math.max(0, priceAfterDiscount - existingPaid);

    if (creditUsed > Math.min(availableCredit, remainingToPay)) {
      toast.error(`Crédito ao cliente limitado a ${formatCurrency(Math.min(availableCredit, remainingToPay))} para este pagamento.`);
      return;
    }
    
    // Check if this is an overpayment with change return scenario
    const effectivePayment = creditUsed + paymentTotal;
    const isOverpaymentWithChange = effectivePayment > remainingToPay && saldoToAdd === 0;
    
    // The amount actually owed to the procedure
    const actualAmountForProcedure = isOverpaymentWithChange
      ? remainingToPay  // Only count what was actually owed
      : Math.min(effectivePayment, remainingToPay);  // Normal case: count what was paid up to remaining
    
    const totalPaid = existingPaid + actualAmountForProcedure + saldoToAdd + courtesyToAdd;
    
    const existingMethods = appointment.payment_methods || [];
    const newMethods = [...new Set([
      ...existingMethods,
      ...paymentMethods.map(p => p.method),
      ...(creditUsed > 0 && usedClientCreditMethod ? [usedClientCreditMethod] : []),
    ])];
    
    // Calculate total card fees from payments
    let totalCardFee = 0;
    let primaryInstallments = 1;
    let primaryPaymentMethodName = '';
    paymentMethods.forEach(p => {
      // Track the first payment method name
      if (!primaryPaymentMethodName && p.method) {
        primaryPaymentMethodName = p.method;
      }
      
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
    // Use priceAfterDiscount for payment status check
    if (totalPaid >= priceAfterDiscount) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    // For the edge function, send the actual procedure value, not excess
    const amountToSendToBackend = isOverpaymentWithChange
      ? existingPaid + actualAmountForProcedure // Send just procedure value
      : totalPaid;

    updatePayment.mutate({
      id: appointmentId,
      payment: {
        payment_methods: newMethods,
        amount_paid: amountToSendToBackend,
        payment_delta: actualAmountForProcedure + saldoToAdd + courtesyToAdd,
        payment_status: paymentStatus,
        additional_items: additionalItems,
        client_credit: saldoToAdd > 0 ? saldoToAdd : undefined, // Saldo: registered in cash/financial
        courtesy_credit: courtesyToAdd > 0 ? courtesyToAdd : undefined, // Cortesia: NOT registered in cash/financial
        used_client_credit: creditUsed > 0 ? creditUsed : undefined,
        client_id: appointment.client_id,
        cash_register_id: cashRegisterId,
        card_fee_amount: totalCardFee > 0 ? totalCardFee : undefined,
        installments: primaryInstallments > 1 ? primaryInstallments : undefined,
        discount_amount: discount > 0 ? discount : undefined,
        payment_method_name: primaryPaymentMethodName || undefined,
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
      expectedVersion: pendingMove.appointment.version,
    });

    setPendingMove(null);
  }, [pendingMove, updateAppointment]);

  const cancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedAppointment(null);
  }, []);

  // When viewing a single professional (professional view OR a professional filter is active),
  // color appointments by status. Otherwise, color them by the professional's agenda_color so
  // multiple professionals are visually separated in shared views.
  const isSingleProfessionalView = viewType === 'professional' || professionalFilter !== 'all';
  const getAppointmentSlotStyle = useCallback((apt: Appointment) => {
    if (isSingleProfessionalView) {
      return getAppointmentStatusStyle(apt.status);
    }
    const profId = apt.professional_id || apt.service?.professional_id;
    const prof = professionals.find(p => p.id === profId);
    const color = prof?.agenda_color || '#a1a1aa';
    return {
      backgroundColor: `${color}24`,
      borderLeft: `3px solid ${color}`,
    } as React.CSSProperties;
  }, [isSingleProfessionalView, professionals]);

  // Render time slot grid for day view - Clean, compact and mobile optimized
  const renderTimeSlotDayView = () => {
    const holiday = getHolidayForDate(selectedDate);
    
    return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-sm sm:text-lg font-semibold text-foreground leading-tight">
            {format(selectedDate, "EEE, d 'de' MMM", { locale: ptBR })}
          </h2>
          {holiday && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className={cn(
                    "gap-1 text-[10px] sm:text-xs border",
                    holiday.type === 'commemorative'
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                  )}>
                    <Umbrella className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    <span className="truncate max-w-[80px] sm:max-w-none">{holiday.name}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{holiday.type === 'commemorative' ? 'Data comemorativa' : 'Feriado Nacional'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Button onClick={handleNewAppointment} size="sm" className="h-7 text-xs w-full sm:w-auto">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Novo Agendamento
        </Button>
      </div>
      
      <ScrollArea className="h-[calc(100dvh-380px)] min-h-[180px] sm:h-[calc(100dvh-360px)] sm:min-h-[220px] rounded-b-xl border border-border/40 bg-card/30 pb-2">
        <div className="space-y-0.5">
          {timeSlots.map(time => {
            const apt = getAppointmentAtSlot(selectedDate, time);
            const absence = getAbsenceAtSlot(selectedDate, time);
            const isStart = apt && isVisibleRangeStart(selectedDate, time, apt.start_time, apt.end_time);
            const isAbsenceStart = absence && isVisibleRangeStart(selectedDate, time, absence.start_time, absence.end_time);
            const profId = apt?.professional_id || apt?.service?.professional_id;
            const prof = professionals.find(p => p.id === profId);
            const absenceProf = absence?.professional ? professionals.find(p => p.id === absence.professional_id) : null;
            const statusStyle = apt ? getAppointmentSlotStyle(apt) : undefined;
            const aptDisplay = apt ? getAppointmentDisplayInfo(apt) : null;
            
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
                  'flex items-stretch gap-1 min-h-[28px] rounded transition-all',
                  apt ? '' : absence ? '' : 'hover:bg-muted/30 cursor-pointer',
                  draggedAppointment && !apt && !absence && 'bg-primary/5 border border-dashed border-primary/20'
                )}
                onClick={() => !draggedAppointment && !absence && handleSlotClick(selectedDate, time)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, selectedDate, time)}
              >
                <div className="w-10 flex-shrink-0 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-muted-foreground">{time}</span>
                </div>
                <div className={cn(
                  'flex-1 rounded border border-dashed p-0.5 min-h-[28px]',
                  peakIndicator ? cn(peakIndicator.bg, peakIndicator.border) : 'border-border/30',
                  (apt && !isStart) && 'opacity-0 pointer-events-none',
                  (absence && !isAbsenceStart) && 'opacity-0 pointer-events-none'
                )}>
                  {isStart && apt && (
                    <div 
                      className={cn(
                        'h-full rounded px-2 py-1 transition-all shadow-sm',
                        dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                        isDragging && 'opacity-50 ring-2 ring-primary'
                      )}
                      style={{ ...statusStyle, minHeight: `${slotsSpan * 28 - 4}px` }}
                      draggable={dragAndDropEnabled}
                      onDragStart={(e) => handleDragStart(e, apt)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAppointmentClick(apt);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {dragAndDropEnabled && (
                            <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-[11px] font-semibold text-foreground truncate">{apt.client?.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">• {aptDisplay?.title}</span>
                          {aptDisplay?.applicationLabel && <span className="text-[9px] text-primary font-medium truncate hidden lg:inline">{aptDisplay.applicationLabel}</span>}
                          {prof && <span className="text-[9px] text-muted-foreground/70 truncate hidden md:inline">({prof.name})</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] font-medium text-foreground">R$ {apt.service?.price.toFixed(0)}</span>
                          <Badge 
                            variant={apt.payment_status === 'paid' ? 'default' : apt.payment_status === 'partial' ? 'secondary' : 'outline'} 
                            className="text-[8px] h-3.5 px-1"
                          >
                            {apt.payment_status === 'paid' ? '✓' : apt.payment_status === 'partial' ? '½' : '○'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                  {isAbsenceStart && absence && !apt && (
                    <div 
                      className="h-full rounded px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      style={{ minHeight: `${absenceSlotsSpan * 28 - 4}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbsenceClick(absence);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <UserX className="h-3 w-3 text-amber-600 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Ausência</span>
                        <span className="text-[9px] text-amber-600/80 dark:text-amber-300/80 truncate">
                          • {absenceProf?.name || absence.professional?.name}
                        </span>
                      </div>
                    </div>
                  )}
                  {!apt && !absence && (
                    <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3 text-muted-foreground" />
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
  };

  const renderWeekView = () => (
    <div className="space-y-2 sm:space-y-4 overflow-x-auto">
      {/* Week days header - Scrollable on mobile */}
      <div className={cn("grid gap-0.5 min-w-[600px] sm:min-w-0", hideSunday ? "grid-cols-7" : "grid-cols-8")}>
        <div className="w-10 sm:w-14 flex-shrink-0" /> {/* Empty space for time column */}
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const holiday = getHolidayForDate(day);

          return (
            <TooltipProvider key={day.toISOString()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setSelectedDate(day);
                      setViewType('day');
                    }}
                    className={cn(
                      'flex flex-col items-center rounded-lg p-2 transition-all duration-200 relative',
                      isSelected 
                        ? 'bg-primary text-primary-foreground' 
                        : holiday 
                          ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30' 
                          : 'hover:bg-secondary',
                      isToday && !isSelected && 'ring-2 ring-primary/30'
                    )}
                  >
                    {holiday && !isSelected && (
                      <Umbrella className={cn(
                        "absolute top-1 right-1 h-2.5 w-2.5",
                        holiday.type === 'commemorative' ? "text-sky-500" : "text-amber-500"
                      )} />
                    )}
                    <span className={cn(
                      'text-[10px] sm:text-xs font-medium uppercase whitespace-nowrap tracking-tight',
                      isSelected ? 'text-primary-foreground/80' : holiday ? (holiday.type === 'commemorative' ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400') : 'text-muted-foreground'
                    )}>
                      {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                    </span>
                    <span className={cn(
                      'text-lg font-semibold',
                      isSelected ? 'text-primary-foreground' : holiday ? (holiday.type === 'commemorative' ? 'text-sky-700 dark:text-sky-300' : 'text-amber-700 dark:text-amber-300') : 'text-foreground'
                    )}>
                      {format(day, 'd')}
                    </span>
                  </button>
                </TooltipTrigger>
                {holiday && (
                  <TooltipContent>
                    <p className="font-medium">{holiday.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {holiday.type === 'commemorative' ? 'Data comemorativa' : 'Feriado Nacional'}
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      {/* Time slots grid - Scrollable on mobile */}
      <ScrollArea className="h-[calc(100dvh-420px)] min-h-[180px] sm:h-[calc(100dvh-390px)] sm:min-h-[220px] rounded-b-xl border border-border/40 bg-card/30 pb-2">

        <div className="space-y-0.5 min-w-[600px] sm:min-w-0">
          {timeSlots.map(time => (
            <div key={time} className={cn("grid gap-0.5 min-h-[26px]", hideSunday ? "grid-cols-7" : "grid-cols-8")}>
              <div className="w-10 sm:w-14 flex items-center justify-center text-[9px] sm:text-[10px] font-medium text-muted-foreground flex-shrink-0">
                {time}
              </div>
              {weekDays.map(day => {
                const apt = getAppointmentAtSlot(day, time);
                const absence = getAbsenceAtSlot(day, time);
                const isStart = apt && isVisibleRangeStart(day, time, apt.start_time, apt.end_time);
                const isAbsenceStart = absence && isVisibleRangeStart(day, time, absence.start_time, absence.end_time);
                const profId = apt?.professional_id || apt?.service?.professional_id;
                const prof = professionals.find(p => p.id === profId);
                const statusStyle = apt ? getAppointmentSlotStyle(apt) : undefined;
                const isDragging = draggedAppointment?.id === apt?.id;
                const aptDisplay = apt ? getAppointmentDisplayInfo(apt) : null;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'rounded border border-dashed border-border/30 min-h-[26px] cursor-pointer transition-all',
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
                           'h-full rounded px-1 py-0.5 text-foreground text-[10px] transition-all',
                          dragAndDropEnabled && 'cursor-grab active:cursor-grabbing',
                          isDragging && 'opacity-50 ring-2 ring-primary'
                        )}
                        style={statusStyle}
                        draggable={dragAndDropEnabled}
                        onDragStart={(e) => handleDragStart(e, apt)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAppointmentClick(apt);
                        }}
                      >
                        <p className="font-medium truncate leading-tight">{apt.client?.name}</p>
                        {aptDisplay?.applicationLabel && (
                          <p className="truncate leading-tight text-[9px] text-primary font-medium">{aptDisplay.applicationLabel}</p>
                        )}
                      </div>
                    )}
                    {isAbsenceStart && absence && !apt && (
                      <div 
                        className="h-full rounded px-1 py-0.5 bg-amber-500/20 border border-amber-500/50 text-[10px] cursor-pointer hover:bg-amber-500/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbsenceClick(absence);
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          <UserX className="h-2.5 w-2.5 text-amber-600" />
                          <span className="text-amber-700 dark:text-amber-400 font-medium truncate">Aus.</span>
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
      <div className={cn("grid gap-1", hideSunday ? "grid-cols-6" : "grid-cols-7")}>
        {(hideSunday ? ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']).map(day => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid gap-1", hideSunday ? "grid-cols-6" : "grid-cols-7")}>
        {monthDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, monthStart);
          const dayAppointments = getAppointmentsForDay(day);
          const holiday = getHolidayForDate(day);
          const hasAbsence = hasFullDayAbsence(day);
          const absenceProfessionals = hasAbsence ? getFullDayAbsenceProfessionals(day) : [];

          return (
            <TooltipProvider key={day.toISOString()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setSelectedDate(day);
                      setViewType('day');
                    }}
                    className={cn(
                      'flex flex-col items-center rounded-lg p-2 min-h-[80px] transition-all duration-200 relative',
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-glow' 
                        : holiday && isCurrentMonth
                          ? (holiday.type === 'commemorative'
                              ? 'bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30'
                              : 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30')
                          : hasAbsence && isCurrentMonth
                            ? 'bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-200 dark:border-orange-800'
                            : 'hover:bg-secondary',
                      isToday && !isSelected && 'ring-2 ring-primary/30',
                      !isCurrentMonth && 'opacity-40'
                    )}
                  >
                    {/* Holiday indicator */}
                    {holiday && !isSelected && isCurrentMonth && (
                      <Umbrella className={cn(
                        "absolute top-1 right-1 h-2.5 w-2.5",
                        holiday.type === 'commemorative' ? "text-sky-500" : "text-amber-500"
                      )} />
                    )}
                    {/* Absence indicator */}
                    {hasAbsence && !holiday && !isSelected && isCurrentMonth && (
                      <UserX className="absolute top-1 right-1 h-2.5 w-2.5 text-orange-500" />
                    )}
                    <span className={cn(
                      'text-sm font-medium',
                      isSelected 
                        ? 'text-primary-foreground' 
                        : holiday && isCurrentMonth 
                          ? (holiday.type === 'commemorative' ? 'text-sky-700 dark:text-sky-300' : 'text-amber-700 dark:text-amber-300')
                          : hasAbsence && isCurrentMonth
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-foreground'
                    )}>
                      {format(day, 'd')}
                    </span>
                    
                    {dayAppointments.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                        {dayAppointments.slice(0, 4).map((apt, i) => {
                          const statusDot = getAppointmentStatusConfig(apt.status).dotClassName;
                          
                          return (
                            <div 
                              key={i} 
                              className={cn('h-2 w-2 rounded-full', isSelected ? 'bg-primary-foreground/70' : statusDot)}
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
                </TooltipTrigger>
                {(holiday || hasAbsence) && (
                  <TooltipContent>
                    {holiday && (
                      <>
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {holiday.type === 'commemorative' ? 'Data comemorativa' : 'Feriado Nacional'}
                        </p>
                      </>
                    )}
                    {hasAbsence && !holiday && (
                      <>
                        <p className="font-medium flex items-center gap-1">
                          <UserX className="h-3 w-3" />
                          Ausência de Profissional
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {absenceProfessionals.join(', ')}
                        </p>
                      </>
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
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
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `56px repeat(${professionalsToShow.length}, 1fr)` }}>
          <div className="w-14" />
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
        <ScrollArea className="h-[calc(100dvh-420px)] min-h-[180px] sm:h-[calc(100dvh-390px)] sm:min-h-[220px] rounded-b-xl border border-border/40 bg-card/30 pb-2">
          <div className="space-y-0.5">
            {timeSlots.map(time => (
              <div 
                key={time} 
                className="grid gap-0.5" 
                style={{ gridTemplateColumns: `56px repeat(${professionalsToShow.length}, 1fr)` }}
              >
                <div className="w-14 flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  {time}
                </div>
                {professionalsToShow.map(prof => {
                  const apt = filteredByFilters.find(a => {
                    const aptProfId = a.professional_id || a.service?.professional_id;
                    return aptProfId === prof.id && isVisibleRangeStart(selectedDate, time, a.start_time, a.end_time);
                  });
                  
                  const occupyingApt = filteredByFilters.find(a => {
                    const aptStart = new Date(a.start_time);
                    const aptEnd = new Date(a.end_time);
                    const aptProfId = a.professional_id || a.service?.professional_id;
                    const [hours, minutes] = time.split(':').map(Number);
                    const slotTime = new Date(selectedDate);
                    slotTime.setHours(hours, minutes, 0, 0);
                    return slotTime >= aptStart && 
                           slotTime < aptEnd &&
                           aptProfId === prof.id;
                  });
                  
                  const isOccupied = occupyingApt && !apt;
                  const isDragging = draggedAppointment?.id === apt?.id;
                  const aptDisplay = apt ? getAppointmentDisplayInfo(apt) : null;

                  return (
                    <div
                      key={prof.id}
                      className={cn(
                        'rounded border border-dashed border-border/30 min-h-[26px] cursor-pointer transition-all',
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
                            'h-full rounded px-1 py-0.5 text-foreground text-[10px] transition-all',
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
                          <p className="font-medium truncate leading-tight">{apt.client?.name}</p>
                          {aptDisplay?.applicationLabel && (
                            <p className="truncate leading-tight text-[9px] text-primary-foreground/90 font-medium">{aptDisplay.applicationLabel}</p>
                          )}
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

  // Check if any automation is enabled to show panel
  // Default to showing the panel if settings haven't loaded yet or no automations configured
  const showAutomationPanel = settings ? (
    settings.automation_occupancy_dashboard || 
    settings.automation_gap_finder || 
    settings.automation_waitlist || 
    settings.automation_smart_recurrence ||
    // Show panel by default if none are explicitly disabled
    (settings.automation_occupancy_dashboard === null && 
     settings.automation_gap_finder === null && 
     settings.automation_waitlist === null && 
     settings.automation_smart_recurrence === null)
  ) : true; // Show while loading

  const handleOpenNewAppointmentFromAutomation = (date?: Date, time?: string) => {
    setPrefilledDate(date);
    setPrefilledTime(time);
    setNewAppointmentDialogOpen(true);
  };

  // Mobile-specific day stats for the header
  const mobileDayStats = useMemo(() => {
    const dayApts = filteredByFilters.filter(apt => isSameDay(new Date(apt.start_time), selectedDate));
    return {
      total: dayApts.length,
      confirmed: dayApts.filter(a => a.status === 'confirmed' || a.status === 'completed').length,
      pending: dayApts.filter(a => a.status === 'scheduled').length,
    };
  }, [filteredByFilters, selectedDate]);

  // Handle mobile date selection (from month/week tapping a day)
  const handleMobileDateSelect = (date: Date) => {
    setSelectedDate(date);
    setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    setMonthStart(startOfMonth(date));
    // When tapping a day in month view, switch to day view
    if (mobileView === 'month') {
      setMobileView('day');
    }
  };

  // Render mobile-optimized smartphone view
  const renderSmartphoneView = () => {
    return (
      <div className="flex flex-col h-full -mx-4 -mt-3 -mb-4 pb-safe">

        {/* Mobile Header */}
        <MobileAgendaHeader
          selectedDate={selectedDate}
          onDateChange={(date) => {
            setSelectedDate(date);
            setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
            setMonthStart(startOfMonth(date));
          }}
          onNewAppointment={handleNewAppointment}
          onFilterClick={() => setShowMobileFilters(true)}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFiltersCount={activeFiltersCount}
          dayStats={mobileDayStats}
          mobileView={mobileView}
          onMobileViewChange={setMobileView}
          onNewAbsence={handleOpenNewAbsence}
          onManageAbsences={() => setShowMobileAbsencePanel(true)}
          onToday={() => {
            const today = new Date();
            setSelectedDate(today);
            setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
            setMonthStart(startOfMonth(today));
          }}
        />
        
        {/* Mobile Appointment List */}
        <div className="flex-1 overflow-hidden">
          <MobileAgendaList
            appointments={filteredByFilters}
            professionals={professionals}
            absences={absences}
            selectedDate={selectedDate}
            onAppointmentClick={handleAppointmentClick}
            onAbsenceClick={handleAbsenceClick}
            mobileView={mobileView}
            onDateSelect={handleMobileDateSelect}
          />
        </div>
      </div>
    );
  };

  // If smartphone, render simplified mobile UI
  if (isSmartphone) {
    return (
      <AppLayout 
        title="Agenda" 
        subtitle=""
      >
        {/* Barra financeira removida da agenda mobile — informações financeiras pertencem às páginas Caixa/Financeiro. */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="h-8 w-8 rounded-full border-4 border-muted animate-spin border-t-primary" />
            <p className="text-xs text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          renderSmartphoneView()
        )}
        
        {/* Mobile Filter Sheet */}
        <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
          <SheetContent side="bottom" className="h-auto max-h-[80vh] flex flex-col">
            <SheetHeader>
              <SheetTitle className="text-sm">Filtros</SheetTitle>
            </SheetHeader>
            <div className="py-3 flex-1 overflow-hidden">
              <AgendaFiltersContent
                professionalFilter={professionalFilter}
                setProfessionalFilter={setProfessionalFilter}
                roomFilter={roomFilter}
                setRoomFilter={setRoomFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                paymentFilter={paymentFilter}
                setPaymentFilter={setPaymentFilter}
                equipmentFilter={equipmentFilter}
                setEquipmentFilter={setEquipmentFilter}
                hideSunday={hideSunday}
                setHideSunday={saveHideSunday}
                professionals={activeProfessionals}
                rooms={activeRooms}
                equipment={activeEquipment}
                hasActiveFilters={hasActiveFilters}
                onClear={clearFilters}
                clientCreditLabel={CLIENT_CREDIT_SOURCE_LABEL}
                nonCashLabel={NON_CASH_PAYMENT_LABEL}
                maxHeightClass="max-h-[55vh]"
              />
            </div>
          </SheetContent>
        </Sheet>
        
        {/* Dialogs */}
        <AppointmentDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          appointment={selectedAppointment}
          professionals={professionals}
          onPayment={handlePayment}
        />
        
        <NewAppointmentDialog
          open={newAppointmentDialogOpen}
          onOpenChange={setNewAppointmentDialogOpen}
          prefilledDate={prefilledDate}
          prefilledTime={prefilledTime}
        />

        {/* Professional Absence Dialog (mobile) */}
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

        {/* Mobile Absence Management Sheet */}
        <Sheet open={showMobileAbsencePanel} onOpenChange={setShowMobileAbsencePanel}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
            <SheetHeader className="pb-3">
              <SheetTitle className="flex items-center gap-2 text-base">
                <UserX className="h-4 w-4 text-amber-600" />
                Ausências Registradas
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <AbsenceManagementPanel
                professionals={professionals}
                onEditAbsence={(absence) => {
                  setEditingAbsence(absence);
                  setShowMobileAbsencePanel(false);
                  setAbsenceDialogOpen(true);
                }}
                onNewAbsence={() => {
                  setShowMobileAbsencePanel(false);
                  handleOpenNewAbsence();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </AppLayout>
    );
  }

  // Desktop/Tablet view (existing layout)
  return (
    <AppLayout 
      title="Agenda" 
      subtitle="Gerencie seus agendamentos"
    >
      <div className="flex h-full">
      {/* Main Agenda Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
      {/* Clean Header Layout - Mobile First, Ultra Compact */}
      <div className="space-y-1.5 mb-2">
        {/* Row 1: Search + Actions - Single Line on Mobile */}
        <div className="flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-7 pr-2 text-xs"
            />
          </div>
          
          {/* Compact Action Buttons */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0 relative">
                <Filter className="h-3.5 w-3.5" />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-primary rounded-full text-[8px] text-primary-foreground flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
              <AgendaFiltersContent
                professionalFilter={professionalFilter}
                setProfessionalFilter={setProfessionalFilter}
                roomFilter={roomFilter}
                setRoomFilter={setRoomFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                paymentFilter={paymentFilter}
                setPaymentFilter={setPaymentFilter}
                equipmentFilter={equipmentFilter}
                setEquipmentFilter={setEquipmentFilter}
                hideSunday={hideSunday}
                setHideSunday={saveHideSunday}
                professionals={activeProfessionals}
                rooms={activeRooms}
                equipment={activeEquipment}
                hasActiveFilters={hasActiveFilters}
                onClear={clearFilters}
                clientCreditLabel={CLIENT_CREDIT_SOURCE_LABEL}
                nonCashLabel={NON_CASH_PAYMENT_LABEL}
                maxHeightClass="max-h-[55vh]"
              />
            </PopoverContent>
          </Popover>

          {/* Absence Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className="h-7 w-7 flex-shrink-0"
              >
                <UserX className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              <DropdownMenuItem onClick={handleOpenNewAbsence} className="text-xs gap-2">
                <Plus className="h-3.5 w-3.5" />
                Registrar Ausência
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowMobileAbsencePanel(true)}
                className="text-xs gap-2"
              >
                <List className="h-3.5 w-3.5" />
                Ausências Registradas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Import/Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-popover">
              <DropdownMenuItem onClick={handleExportAppointments} className="text-xs gap-2">
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAppointmentsPDF} className="text-xs gap-2">
                <Download className="h-3.5 w-3.5" />
                Exportar PDF
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setImportDialogOpen(true)}
                className="text-xs gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                Importar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: View Toggle - Mobile Responsive */}
        <div className="flex flex-wrap items-center gap-1">
          <ToggleGroup type="single" value={viewType} onValueChange={(v) => v && setViewType(v as ViewType)} className="justify-start gap-0.5">
            <ToggleGroupItem value="day" aria-label="Ver dia" className="h-6 px-2 sm:px-2.5 text-[10px] sm:text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <List className="h-3 w-3" />
              <span className="hidden xs:inline">Dia</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Ver semana" className="h-6 px-2 sm:px-2.5 text-[10px] sm:text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden xs:inline">Sem</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="month" aria-label="Ver mês" className="h-6 px-2 sm:px-2.5 text-[10px] sm:text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <CalendarIcon className="h-3 w-3" />
              <span className="hidden xs:inline">Mês</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="professional" aria-label="Ver por profissional" className="h-6 px-2 sm:px-2.5 text-[10px] sm:text-[11px] gap-0.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <User className="h-3 w-3" />
              <span className="hidden xs:inline">Prof.</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Navigation - Mobile Optimized */}
      <div className="rounded-xl border border-border/50 bg-card p-2 sm:p-3 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-1 w-full sm:w-auto">
            <Button variant="ghost" size="icon" onClick={goToPrevious} className="h-7 w-7 flex-shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNext} className="h-7 w-7 flex-shrink-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 text-xs sm:text-sm font-medium text-foreground capitalize truncate">
              {getNavigationLabel()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={goToToday} className="h-7 text-[10px] sm:text-xs px-2 sm:px-2.5">
              Hoje
            </Button>
            {(viewType === 'week' || viewType === 'month') && (
              <Button size="sm" onClick={handleNewAppointment} className="h-7 text-[10px] sm:text-xs px-2 sm:px-2.5">
                <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1" />
                <span className="hidden xs:inline">Novo</span>
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
        </div>

        {/* Side Panel - Automation + Absences */}
        <div className="hidden lg:flex flex-col gap-3 w-80 flex-shrink-0">
          {/* Absence Management Panel */}
          <AbsenceManagementPanel
            professionals={professionals}
            onEditAbsence={(absence) => {
              setEditingAbsence(absence);
              setAbsenceDialogOpen(true);
            }}
            onNewAbsence={handleOpenNewAbsence}
          />

          {/* Automation Panel */}
          {showAutomationPanel && (
            <AgendaAutomationPanel
              selectedDate={selectedDate}
              onOpenNewAppointment={handleOpenNewAppointmentFromAutomation}
            />
          )}
        </div>
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

      {/* Import Appointments Dialog */}
      <ImportAppointmentsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      {/* Mobile Absence Panel Sheet */}
      <Sheet open={showMobileAbsencePanel} onOpenChange={setShowMobileAbsencePanel}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader className="pb-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <UserX className="h-4 w-4 text-amber-600" />
              Ausências Registradas
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <AbsenceManagementPanel
              professionals={professionals}
              onEditAbsence={(absence) => {
                setEditingAbsence(absence);
                setShowMobileAbsencePanel(false);
                setAbsenceDialogOpen(true);
              }}
              onNewAbsence={() => {
                setShowMobileAbsencePanel(false);
                handleOpenNewAbsence();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

export default Agenda;
