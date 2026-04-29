import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, AlertTriangle, CheckCircle, UserX, Package, Info, Briefcase, Pencil, MessageCircle, Repeat, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientServices } from '@/hooks/useClientServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useBrazilianHolidays } from '@/hooks/useBrazilianHolidays';
import { Appointment } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getPackageAvailabilitySummary } from '@/lib/packageAvailability';

interface ConflictInfo {
  type: 'professional' | 'room' | 'equipment' | 'absence';
  message: string;
  appointment?: Appointment;
}

interface NewAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledDate?: Date;
  prefilledTime?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export function NewAppointmentDialog({ 
  open, 
  onOpenChange, 
  prefilledDate, 
  prefilledTime 
}: NewAppointmentDialogProps) {
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [serviceType, setServiceType] = useState<'service' | 'package'>('service');
  const [manualDuration, setManualDuration] = useState(60);
  const [serviceSearch, setServiceSearch] = useState('');
  const [packageQuickFilter, setPackageQuickFilter] = useState<'all' | 'standard' | 'sequential'>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showServiceSuggestions, setShowServiceSuggestions] = useState(false);
  
  // Auto-schedule settings for packages
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
  const [preferredDayOfWeek, setPreferredDayOfWeek] = useState<number | null>(null);
  const [preferredTime, setPreferredTime] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewDates, setPreviewDates] = useState<Date[]>([]);
  const [editablePreviewDates, setEditablePreviewDates] = useState<Date[]>([]);
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null);
  const [sendWhatsappNotification, setSendWhatsappNotification] = useState(true);
  
  // Recurring service settings (for regular services, not packages)
  const [repeatServiceEnabled, setRepeatServiceEnabled] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);
  const [serviceIntervalDays, setServiceIntervalDays] = useState(7);
  const [servicePreviewDates, setServicePreviewDates] = useState<Date[]>([]);
  const [editableServiceDates, setEditableServiceDates] = useState<Date[]>([]);
  const [editingServiceDateIndex, setEditingServiceDateIndex] = useState<number | null>(null);
  const [showHolidayConfirm, setShowHolidayConfirm] = useState(false);
  const [holidayConfirmed, setHolidayConfirmed] = useState(false);

  const { clients } = useClients();
  const { services } = useServices();
  const { packages } = useServicePackages();
  const { templates: packageTemplates } = usePackageTemplates();
  const { clientPackages, availablePackages, findClientPackageByTemplate, createClientPackage, incrementPackageSession, getRemainingSessionCount, getSchedulableSessionCount } = useClientPackages(selectedClient || null);
  const { availableServices: clientPaidServices, markServiceAsUsed } = useClientServices(selectedClient || null);
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();
  const { appointments, createAppointment } = useAppointments();
  const { settings, generateTimeSlots, getBusinessHoursForDay } = useBusinessSettings();
  const { absences } = useProfessionalAbsences();
  const { sendMessage: sendWhatsappMessage, connectionStatus } = useWhatsapp();
  const { createRecurringAppointments } = useRecurringAppointments();
  const { getHolidayForDate } = useBrazilianHolidays(date?.getFullYear());
  const timeSlots = generateTimeSlots();

  // State to track if using a paid service
  const [usingPaidServiceId, setUsingPaidServiceId] = useState<string | null>(null);

  // Memoized settings values to prevent re-renders
  const workSundays = settings?.work_sundays ?? false;
  const workSaturdays = settings?.work_saturdays ?? false;

  // Check if a date is a valid work day - memoized to prevent infinite loops
  const isWorkDay = useCallback((date: Date): boolean => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 && !workSundays) return false; // Sunday
    if (dayOfWeek === 6 && !workSaturdays) return false; // Saturday
    return true;
  }, [workSundays, workSaturdays]);
  const catalogPackages = useMemo(() => {
    const legacyPackages = packages.filter(p => p.is_active && !p.client_id);
    const templatePackages = packageTemplates
      .filter(template => template.is_active)
      .map(template => ({
        ...template,
        template_id: template.id,
        total_price: template.price,
        service_id: template.service_id || null,
        client_id: null,
        sessions_scheduled: 0,
        auto_schedule: false,
        preferred_day_of_week: null,
        preferred_time: null,
        payment_method: null,
        payment_methods: [],
        payment_type: null,
        whatsapp_reminder: false,
        category: null,
        updated_by: null,
      }));

    return [...legacyPackages, ...templatePackages] as any[];
  }, [packages, packageTemplates]);

  const selectedServiceData = services.find(s => s.id === selectedService);
  // Look for package in both templates and client packages (paid packages)
  const selectedPackageData = catalogPackages.find(p => p.id === selectedService) 
    || clientPackages.find(p => p.id === selectedService);
  const currentDuration = serviceType === 'service' 
    ? (selectedServiceData?.duration || manualDuration) 
    : (selectedPackageData?.duration || manualDuration);
  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeClients = clients.filter(c => c.is_active);
  const activeRooms = rooms.filter(r => r.is_active);
  const activeEquipment = equipment.filter(e => e.is_active);
  const activePackages = catalogPackages;
  const serviceSearchNormalized = serviceSearch.toLowerCase();
  const matchesServiceSearch = (name?: string | null) => !serviceSearchNormalized || (name || '').toLowerCase().includes(serviceSearchNormalized);
  const matchesPackageQuickFilter = (pkg: { package_type?: string | null }) =>
    packageQuickFilter === 'all' || (packageQuickFilter === 'sequential' ? pkg.package_type === 'sequential' : pkg.package_type !== 'sequential');
  const visibleClientPackages = availablePackages.filter(pkg => matchesServiceSearch(pkg.name) && matchesPackageQuickFilter(pkg));
  const visibleCatalogPackages = activePackages.filter(pkg => matchesServiceSearch(pkg.name) && matchesPackageQuickFilter(pkg));

  // Check if selected package is already a client package (paid)
  const isClientPackageSelected = clientPackages.some(p => p.id === selectedService);
  
  // Check if client already has this package (by template)
  const existingClientPackage = serviceType === 'package' && selectedService && selectedClient
    ? (isClientPackageSelected 
        ? clientPackages.find(p => p.id === selectedService)
        : findClientPackageByTemplate(selectedService))
    : null;

  const packageRemainingSessions = existingClientPackage
    ? getRemainingSessionCount(existingClientPackage)
    : selectedPackageData?.total_sessions || 0;
  const selectedPackageAvailability = existingClientPackage
    ? getPackageAvailabilitySummary(existingClientPackage)
    : null;
  const existingPackageHasStarted = existingClientPackage
    ? existingClientPackage.appointments?.some(session => Boolean(session.appointment_id) || ['completed', 'missed'].includes(session.status))
      ?? existingClientPackage.sessions_scheduled > 0
    : false;

  // Reset form and apply prefilled values when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedClient('');
      setSelectedService('');
      setSelectedProfessional('');
      setSelectedRoom('');
      setSelectedEquipment([]);
      setNotes('');
      setDate(prefilledDate || undefined);
      setTime(prefilledTime || '');
      setAutoScheduleEnabled(false);
      setPreferredDayOfWeek(null);
      setPreferredTime('');
      setShowPreview(false);
      setPreviewDates([]);
      setServiceType('service');
      setServiceSearch('');
      setClientSearch('');
      // Reset recurring service states
      setRepeatServiceEnabled(false);
      setRepeatCount(4);
      setServiceIntervalDays(7); // Reset to default, will be updated when service is selected
      setServicePreviewDates([]);
      setEditableServiceDates([]);
      setEditingServiceDateIndex(null);
      setShowHolidayConfirm(false);
      setHolidayConfirmed(false);
    }
  }, [open, prefilledDate, prefilledTime]);

  useEffect(() => {
    setHolidayConfirmed(false);
    setShowHolidayConfirm(false);
  }, [date]);

  // Reset paid service when client changes
  useEffect(() => {
    setUsingPaidServiceId(null);
    setSelectedService('');
    setServiceSearch('');
    setServiceType('service');
  }, [selectedClient]);

  // Debug log for client packages
  useEffect(() => {
    if (selectedClient && availablePackages.length > 0) {
      console.log('Client packages available for scheduling:', availablePackages.map(p => ({
        id: p.id,
        name: p.name,
        remaining: getSchedulableSessionCount(p)
      })));
    }
  }, [selectedClient, availablePackages, getSchedulableSessionCount]);
  // Auto-fill professional and room from service or package data
  // Auto-fill professional, room, and equipment from service or package data
  useEffect(() => {
    if (serviceType === 'service' && selectedServiceData) {
      if (selectedServiceData.professional_id) {
        setSelectedProfessional(selectedServiceData.professional_id);
      }
      if (selectedServiceData.room_id) {
        setSelectedRoom(selectedServiceData.room_id);
      }
      // Auto-fill equipment from service
      if (selectedServiceData.equipment && selectedServiceData.equipment.length > 0) {
        setSelectedEquipment(selectedServiceData.equipment);
      }
    } else if (serviceType === 'package' && selectedPackageData) {
      if (selectedPackageData.professional_id) {
        setSelectedProfessional(selectedPackageData.professional_id);
      }
      if (selectedPackageData.room_id) {
        setSelectedRoom(selectedPackageData.room_id);
      }
      // Auto-fill equipment from package
      if (selectedPackageData.equipment && selectedPackageData.equipment.length > 0) {
        setSelectedEquipment(selectedPackageData.equipment);
      }
    }
  }, [selectedServiceData, selectedPackageData, serviceType]);

  // Calculate appointment start and end times
  const appointmentTimes = useMemo(() => {
    if (!date || !time) return null;
    
    const duration = serviceType === 'service' 
      ? (selectedServiceData?.duration || 60) 
      : (selectedPackageData?.duration || 60);
    
    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    return { startTime, endTime };
  }, [date, time, selectedServiceData, selectedPackageData, serviceType]);

  // Calculate preview dates for auto-scheduling
  const packageSequenceSteps = useMemo(() => {
    const packageData = existingClientPackage || selectedPackageData;
    if (packageData?.package_type === 'sequential' && packageData.appointments?.length) {
      return packageData.appointments
        .map(session => ({
          service_id: session.service_id,
          sequence_order: session.sequence_order || session.session_number,
          interval_after_days: session.interval_after_days || 0,
        }))
        .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
    }

    return packageData?.package_type === 'sequential' && packageData.steps?.length
      ? [...packageData.steps].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
      : [];
  }, [existingClientPackage, selectedPackageData]);

  const calculatePreviewDates = useMemo(() => {
    if (!appointmentTimes || !autoScheduleEnabled) return [];
    
    const packageData = existingClientPackage || selectedPackageData;
    const totalSessions = packageData?.total_sessions || 1;
    if (totalSessions <= 1) return [];

    const dates: Date[] = [appointmentTimes.startTime];
    let currentDate = appointmentTimes.startTime;

    for (let i = 1; i < totalSessions; i++) {
      const previousStep = packageSequenceSteps[i - 1];
      const intervalDays = packageSequenceSteps.length > 0
        ? Number(previousStep?.interval_after_days || 0)
        : Number(packageData?.interval_days || 7);
      const futureDate = addDays(currentDate, intervalDays);
      
      // Adjust to preferred day of week if set
      if (preferredDayOfWeek !== null) {
        while (futureDate.getDay() !== preferredDayOfWeek) {
          futureDate.setDate(futureDate.getDate() + 1);
        }
      }

      // Apply preferred time if set
      if (preferredTime) {
        const [hours, minutes] = preferredTime.split(':').map(Number);
        futureDate.setHours(hours, minutes, 0, 0);
      }

      dates.push(new Date(futureDate));
      currentDate = futureDate;
    }

    return dates;
  }, [appointmentTimes, autoScheduleEnabled, existingClientPackage, selectedPackageData, packageSequenceSteps, preferredDayOfWeek, preferredTime]);

  // Update preview dates when calculation changes
  useEffect(() => {
    setPreviewDates(calculatePreviewDates);
    setEditablePreviewDates(calculatePreviewDates);
    setEditingDateIndex(null);
    if (calculatePreviewDates.length > 0) {
      setShowPreview(true);
    }
  }, [calculatePreviewDates]);

  // Calculate preview dates for recurring service appointments
  // Memoize the interval to prevent recalculation loops
  const effectiveIntervalDays = useMemo(() => {
    return serviceIntervalDays || selectedServiceData?.return_days || 7;
  }, [serviceIntervalDays, selectedServiceData?.return_days]);

  const calculateServicePreviewDates = useMemo(() => {
    if (!appointmentTimes || !repeatServiceEnabled || serviceType !== 'service') return [];
    if (repeatCount < 2) return [];

    const dates: Date[] = [appointmentTimes.startTime];

    for (let i = 1; i < repeatCount; i++) {
      let futureDate = addDays(appointmentTimes.startTime, effectiveIntervalDays * i);
      
      // Skip non-work days
      while (!isWorkDay(futureDate)) {
        futureDate = addDays(futureDate, 1);
      }

      // Apply preferred time if set
      if (preferredTime) {
        const [hours, minutes] = preferredTime.split(':').map(Number);
        futureDate.setHours(hours, minutes, 0, 0);
      }

      dates.push(new Date(futureDate));
    }

    return dates;
  }, [appointmentTimes, repeatServiceEnabled, repeatCount, effectiveIntervalDays, serviceType, preferredTime, isWorkDay]);

  // Update service preview dates when calculation changes
  useEffect(() => {
    setServicePreviewDates(calculateServicePreviewDates);
    setEditableServiceDates(calculateServicePreviewDates);
    setEditingServiceDateIndex(null);
  }, [calculateServicePreviewDates]);

  // When service is selected, update interval from service's return_days
  // Using selectedServiceData?.id to avoid loop when object reference changes
  const selectedServiceId = selectedServiceData?.id;
  const selectedServiceReturnDays = selectedServiceData?.return_days;
  useEffect(() => {
    if (selectedServiceReturnDays && selectedServiceId) {
      setServiceIntervalDays(selectedServiceReturnDays);
    }
  }, [selectedServiceId, selectedServiceReturnDays]);

  // Update a specific date in the editable preview
  const updateEditableDate = (index: number, newDate: Date) => {
    setEditablePreviewDates(prev => {
      const updated = [...prev];
      updated[index] = newDate;
      return updated;
    });
  };

  // Update a specific date in the editable service dates
  const updateEditableServiceDate = (index: number, newDate: Date) => {
    setEditableServiceDates(prev => {
      const updated = [...prev];
      updated[index] = newDate;
      return updated;
    });
  };

  // Helper function to check conflicts for a specific date/time
  const checkConflictsForDateTime = (checkStart: Date, checkEnd: Date): ConflictInfo[] => {
    const foundConflicts: ConflictInfo[] = [];

    // Check for professional absence
    if (selectedProfessional) {
      absences.forEach(absence => {
        const absenceStart = new Date(absence.start_time);
        const absenceEnd = new Date(absence.end_time);
        
        const overlaps = checkStart < absenceEnd && checkEnd > absenceStart;
        if (overlaps && absence.professional_id === selectedProfessional) {
          const prof = professionals.find(p => p.id === selectedProfessional);
          foundConflicts.push({
            type: 'absence',
            message: `${prof?.name || 'Profissional'} está ausente neste horário (${absence.reason || 'sem motivo informado'})`,
          });
        }
      });
    }

    appointments.forEach(apt => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);

      // Check if times overlap
      const overlaps = checkStart < aptEnd && checkEnd > aptStart;
      if (!overlaps) return;

      // Check professional conflict
      const aptProfId = apt.professional_id || apt.service?.professional_id;
      if (selectedProfessional && aptProfId === selectedProfessional) {
        const prof = professionals.find(p => p.id === selectedProfessional);
        foundConflicts.push({
          type: 'professional',
          message: `${prof?.name || 'Profissional'} já tem agendamento às ${format(aptStart, 'HH:mm')} com ${apt.client?.name}`,
          appointment: apt,
        });
      }

      // Check room conflict
      const aptRoomId = apt.room_id || apt.service?.room_id;
      if (selectedRoom && aptRoomId === selectedRoom) {
        const room = rooms.find(r => r.id === selectedRoom);
        foundConflicts.push({
          type: 'room',
          message: `${room?.name || 'Sala'} já está ocupada às ${format(aptStart, 'HH:mm')}`,
          appointment: apt,
        });
      }
    });

    return foundConflicts;
  };

  // Check for conflicts for the main appointment
  const conflicts = useMemo<ConflictInfo[]>(() => {
    if (!appointmentTimes) return [];
    return checkConflictsForDateTime(appointmentTimes.startTime, appointmentTimes.endTime);
  }, [appointmentTimes, appointments, absences, selectedProfessional, selectedRoom, professionals, rooms]);

  // Check conflicts for auto-scheduled dates and suggest alternatives
  const previewDateConflicts = useMemo<{ index: number; conflicts: ConflictInfo[]; suggestedDate: Date | null }[]>(() => {
    if (!autoScheduleEnabled || editablePreviewDates.length === 0) return [];
    
    const duration = serviceType === 'service' 
      ? (selectedServiceData?.duration || 60) 
      : (selectedPackageData?.duration || 60);
    
    return editablePreviewDates.map((previewDate, index) => {
      const endTime = new Date(previewDate);
      endTime.setMinutes(endTime.getMinutes() + duration);
      
      const dateConflicts = checkConflictsForDateTime(previewDate, endTime);
      
      // Find alternative if there are conflicts
      let suggestedDate: Date | null = null;
      if (dateConflicts.length > 0) {
        // Try to find an available slot on the same day first
        const [hours, minutes] = format(previewDate, 'HH:mm').split(':').map(Number);
        const timeSlotIndex = timeSlots.findIndex(slot => slot === format(previewDate, 'HH:mm'));
        
        // Try next slots on the same day
        for (let i = timeSlotIndex + 1; i < timeSlots.length; i++) {
          const [slotHours, slotMinutes] = timeSlots[i].split(':').map(Number);
          const testDate = new Date(previewDate);
          testDate.setHours(slotHours, slotMinutes, 0, 0);
          const testEnd = new Date(testDate);
          testEnd.setMinutes(testEnd.getMinutes() + duration);
          
          if (checkConflictsForDateTime(testDate, testEnd).length === 0) {
            suggestedDate = testDate;
            break;
          }
        }
        
        // If no slot available on the same day, try next day at the same time
        if (!suggestedDate) {
          let tryDate = addDays(previewDate, 1);
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            if (isWorkDay(tryDate)) {
              const testEnd = new Date(tryDate);
              testEnd.setMinutes(testEnd.getMinutes() + duration);
              
              if (checkConflictsForDateTime(tryDate, testEnd).length === 0) {
                suggestedDate = tryDate;
                break;
              }
            }
            tryDate = addDays(tryDate, 1);
          }
        }
      }
      
      return { index, conflicts: dateConflicts, suggestedDate };
    });
  }, [editablePreviewDates, autoScheduleEnabled, appointments, absences, selectedProfessional, selectedRoom, serviceType, selectedServiceData, selectedPackageData, timeSlots]);

  // Check if any preview date has conflicts
  const hasPreviewConflicts = previewDateConflicts.some(pc => pc.conflicts.length > 0);

  // Check conflicts for recurring service dates and suggest alternatives
  const servicePreviewConflicts = useMemo<{ index: number; conflicts: ConflictInfo[]; suggestedDate: Date | null }[]>(() => {
    if (!repeatServiceEnabled || editableServiceDates.length === 0 || serviceType !== 'service') return [];
    
    const duration = selectedServiceData?.duration || 60;
    
    return editableServiceDates.map((previewDate, index) => {
      const endTime = new Date(previewDate);
      endTime.setMinutes(endTime.getMinutes() + duration);
      
      const dateConflicts = checkConflictsForDateTime(previewDate, endTime);
      
      // Find alternative if there are conflicts
      let suggestedDate: Date | null = null;
      if (dateConflicts.length > 0) {
        // Try to find an available slot on the same day first
        const timeSlotIndex = timeSlots.findIndex(slot => slot === format(previewDate, 'HH:mm'));
        
        // Try next slots on the same day
        for (let i = timeSlotIndex + 1; i < timeSlots.length; i++) {
          const [slotHours, slotMinutes] = timeSlots[i].split(':').map(Number);
          const testDate = new Date(previewDate);
          testDate.setHours(slotHours, slotMinutes, 0, 0);
          const testEnd = new Date(testDate);
          testEnd.setMinutes(testEnd.getMinutes() + duration);
          
          if (checkConflictsForDateTime(testDate, testEnd).length === 0) {
            suggestedDate = testDate;
            break;
          }
        }
        
        // If no slot available on the same day, try next day at the same time
        if (!suggestedDate) {
          let tryDate = addDays(previewDate, 1);
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            if (isWorkDay(tryDate)) {
              const testEnd = new Date(tryDate);
              testEnd.setMinutes(testEnd.getMinutes() + duration);
              
              if (checkConflictsForDateTime(tryDate, testEnd).length === 0) {
                suggestedDate = tryDate;
                break;
              }
            }
            tryDate = addDays(tryDate, 1);
          }
        }
      }
      
      return { index, conflicts: dateConflicts, suggestedDate };
    });
  }, [editableServiceDates, repeatServiceEnabled, appointments, absences, selectedProfessional, selectedRoom, serviceType, selectedServiceData, timeSlots, isWorkDay]);

  // Check if any service preview date has conflicts
  const hasServicePreviewConflicts = servicePreviewConflicts.some(pc => pc.conflicts.length > 0);

  // Business hours validation - check if selected date/time is within business hours
  const businessHoursError = useMemo(() => {
    if (!date || !time || !settings) return null;
    const dayOfWeek = date.getDay();
    const hours = getBusinessHoursForDay(dayOfWeek);
    
    if (!hours.isOpen) {
      const dayName = dayOfWeek === 0 ? 'Domingo' : 'Sábado';
      return `Estabelecimento fechado ${dayName === 'Domingo' ? 'aos domingos' : 'aos sábados'}`;
    }
    
    if (time < hours.open || time >= hours.close) {
      return `Horário fora do funcionamento (${hours.open} - ${hours.close})`;
    }
    
    return null;
  }, [date, time, settings, getBusinessHoursForDay]);

  // Client's frequent services - services from appointment history
  const clientFrequentServices = useMemo(() => {
    if (!selectedClient) return [];
    
    const serviceCount: Record<string, number> = {};
    appointments.forEach(apt => {
      if (apt.client_id === selectedClient && apt.service_id && !['cancelled', 'missed'].includes(apt.status)) {
        serviceCount[apt.service_id] = (serviceCount[apt.service_id] || 0) + 1;
      }
    });
    
    return Object.entries(serviceCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([serviceId, count]) => {
        const service = services.find(s => s.id === serviceId);
        return service ? { ...service, bookingCount: count } : null;
      })
      .filter(Boolean) as (typeof services[0] & { bookingCount: number })[];
  }, [selectedClient, appointments, services]);

  // Get available time slots for the selected date
  const availableSlots = useMemo<{ slot: string; isAvailable: boolean; conflictReason: string }[]>(() => {
    const duration = selectedServiceData?.duration || 60;
    
    return timeSlots.map(slot => {
      if (!date) return { slot, isAvailable: true, conflictReason: '' };

      const [hours, minutes] = slot.split(':').map(Number);
      const slotStart = new Date(date);
      slotStart.setHours(hours, minutes, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);

      let isAvailable = true;
      let conflictReason = '';

      // Check for professional absences
      if (selectedProfessional) {
        absences.forEach(absence => {
          const absenceStart = new Date(absence.start_time);
          const absenceEnd = new Date(absence.end_time);
          const overlaps = slotStart < absenceEnd && slotEnd > absenceStart;
          if (overlaps && absence.professional_id === selectedProfessional) {
            isAvailable = false;
            conflictReason = 'Profissional ausente';
          }
        });
      }

      appointments.forEach(apt => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);

        const overlaps = slotStart < aptEnd && slotEnd > aptStart;
        if (!overlaps) return;

        const aptProfId = apt.professional_id || apt.service?.professional_id;
        const aptRoomId = apt.room_id || apt.service?.room_id;

        if (selectedProfessional && aptProfId === selectedProfessional) {
          isAvailable = false;
          conflictReason = 'Profissional ocupado';
        }
        if (selectedRoom && aptRoomId === selectedRoom) {
          isAvailable = false;
          conflictReason = 'Sala ocupada';
        }
      });

      return { slot, isAvailable, conflictReason };
    });
  }, [date, selectedServiceData, appointments, absences, selectedProfessional, selectedRoom, timeSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isPackageAppointment = serviceType === 'package';
    const serviceOrPackage = isPackageAppointment ? selectedPackageData : selectedServiceData;
    
    // For packages, selectedService contains the package ID, not service ID
    // For services, selectedService must be a valid service ID
    if (!selectedClient || !date || !time || !serviceOrPackage) {
      return;
    }
    
    // Block if outside business hours
    if (businessHoursError) {
      toast.error(businessHoursError);
      return;
    }
    
    // For regular services, we need a service_id
    if (!isPackageAppointment && !selectedService) {
      return;
    }

    // Block if there are conflicts
    if (conflicts.length > 0) {
      return;
    }

    const holiday = getHolidayForDate(date);
    if (holiday && !holidayConfirmed) {
      setShowHolidayConfirm(true);
      return;
    }

    const duration = serviceOrPackage.duration || 60;
    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    try {
      if (isPackageAppointment && selectedPackageData) {
        let clientPackageId = existingClientPackage?.id;
        
        // If it's a new package for this client, create it first
        if (!existingClientPackage) {
          const newPackage = await createClientPackage.mutateAsync({
            clientId: selectedClient,
            templateId: selectedPackageData.template_id || null,
            templateData: {
              name: selectedPackageData.name,
              total_sessions: selectedPackageData.total_sessions,
              duration: selectedPackageData.duration || 60,
              interval_days: selectedPackageData.interval_days || 7,
              total_price: selectedPackageData.total_price,
              package_type: selectedPackageData.package_type || 'standard',
              service_id: selectedPackageData.service_id || null,
              steps: selectedPackageData.steps || [],
              professional_id: selectedProfessional || selectedPackageData.professional_id,
              room_id: selectedRoom || selectedPackageData.room_id,
              equipment: selectedPackageData.equipment || [],
            },
            autoSchedule: autoScheduleEnabled,
            preferredDayOfWeek: preferredDayOfWeek ?? undefined,
            preferredTime: preferredTime || time,
          });
          clientPackageId = newPackage.id;
        }

        // Create the first/next appointment
        // For packages, use the package's service_id if available, otherwise null
        const firstSequenceStep = packageSequenceSteps[0];
        const packageServiceId = firstSequenceStep?.service_id || selectedPackageData?.service_id || null;
        
        // Package is only "paid" if it's an existing client package that was purchased
        // A client package is created when sold through the sales flow
        // Check if package has payment_methods filled (indicates it was paid via caixa sale)
        const isPackagePaid = isClientPackageSelected && existingClientPackage && 
          existingClientPackage.payment_methods && existingClientPackage.payment_methods.length > 0;
        
        const appointmentResult = await createAppointment.mutateAsync({
          client_id: selectedClient,
          service_id: packageServiceId,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          notes: `${selectedPackageData.name}${notes ? ' - ' + notes : ''}`, // Session number will be added by incrementPackageSession
          professional_id: selectedProfessional || selectedPackageData.professional_id || undefined,
          room_id: selectedRoom || selectedPackageData.room_id || undefined,
          payment_status: isPackagePaid ? 'paid' : 'pending',
        });

        // Link the appointment to the package session
        if (clientPackageId) {
          await incrementPackageSession.mutateAsync({
            packageId: clientPackageId,
            appointmentId: appointmentResult.id,
          });
        }

        // If auto-schedule is enabled and it's the first appointment (either new package or existing with 0 sessions scheduled)
        const isFirstAppointment = !existingClientPackage || !existingPackageHasStarted;
        const packageData = existingClientPackage || selectedPackageData;
        const totalSessions = packageData?.total_sessions || 1;
        
        // Get client info for WhatsApp
        const clientData = clients.find(c => c.id === selectedClient);
        
        if (autoScheduleEnabled && isFirstAppointment && totalSessions > 1 && editablePreviewDates.length > 1) {
          const sessionsToCreate = editablePreviewDates.length - 1;
          let createdCount = 0;
          const failedSessions: number[] = [];

          // Create appointments sequentially to ensure proper conflict detection
          // Each appointment must complete before the next one starts to avoid race conditions
          for (let i = 1; i <= sessionsToCreate; i++) {
            // Use editable dates instead of calculated dates
            const futureDate = editablePreviewDates[i];
            const futureServiceId = packageSequenceSteps[i]?.service_id || packageServiceId;
            const futureService = services.find(service => service.id === futureServiceId);
            const futureDuration = futureService?.duration || duration;
            
            const futureEnd = new Date(futureDate);
            futureEnd.setMinutes(futureEnd.getMinutes() + futureDuration);

            try {
              // Wait for each appointment to be fully created before proceeding
              // This ensures the Edge Function can properly detect conflicts
              const futureAppointment = await createAppointment.mutateAsync({
                client_id: selectedClient,
                service_id: futureServiceId,
                start_time: futureDate.toISOString(),
                end_time: futureEnd.toISOString(),
                notes: `${packageData?.name || selectedPackageData?.name}${notes ? ' - ' + notes : ''}`, // Session number will be added by incrementPackageSession
                professional_id: selectedProfessional || packageData?.professional_id || undefined,
                room_id: selectedRoom || packageData?.room_id || undefined,
                payment_status: isPackagePaid ? 'paid' : 'pending',
              });

              if (clientPackageId) {
                await incrementPackageSession.mutateAsync({
                  packageId: clientPackageId,
                  appointmentId: futureAppointment.id,
                });
              }
              createdCount++;
            } catch (error) {
              console.error(`Error creating session ${i + 1}:`, error);
              failedSessions.push(i + 1);
              // Continue creating other sessions even if one fails
            }
          }

          // Report results
          if (failedSessions.length > 0) {
            toast.warning(`${createdCount + 1} agendamentos criados. Sessões ${failedSessions.join(', ')} tiveram conflitos e não foram agendadas.`);
          } else {
            toast.success(`${createdCount + 1} agendamentos criados automaticamente!`);
          }

          toast.success(`${sessionsToCreate + 1} agendamentos criados automaticamente!`);

          // Send WhatsApp notification for all scheduled sessions
          if (sendWhatsappNotification && clientData?.phone) {
            try {
              const sessionsList = editablePreviewDates.map((d, i) => 
                `📅 Sessão ${i + 1}: ${format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
              ).join('\n');

              const message = `Olá ${clientData.name}! 👋

Seu pacote *${packageData?.name}* foi agendado com sucesso! 🎉

Confira as datas das suas ${totalSessions} sessões:

${sessionsList}

Se precisar reagendar alguma sessão, entre em contato conosco.

Até breve! ✨`;

              await sendWhatsappMessage(clientData.phone, message);
              toast.success('Notificação WhatsApp enviada!');
            } catch (error) {
              console.error('Error sending WhatsApp notification:', error);
              // Don't fail the whole operation if WhatsApp fails
            }
          }
        }
      } else {
        // Regular service appointment
        const clientData = clients.find(c => c.id === selectedClient);
        
        // Check if recurring appointments are enabled for this service
        if (repeatServiceEnabled && editableServiceDates.length > 1 && !usingPaidServiceId) {
          // Create recurring appointments using the hook with custom dates
          const duration = selectedServiceData?.duration || 60;
          
          await createRecurringAppointments.mutateAsync({
            client_id: selectedClient,
            service_id: selectedService,
            start_time: editableServiceDates[0],
            end_time: endTime,
            professional_id: selectedProfessional || undefined,
            room_id: selectedRoom || undefined,
            notes: notes || undefined,
            repeat_count: editableServiceDates.length,
            interval_days: serviceIntervalDays,
            send_whatsapp: sendWhatsappNotification && !!clientData?.phone,
            client_phone: clientData?.phone,
            client_name: clientData?.name,
            service_name: selectedServiceData?.name,
            // Pass the custom edited dates so they are used exactly as the user configured
            custom_dates: editableServiceDates,
            duration_minutes: duration,
          });
        } else {
          // Single appointment
          const appointmentResult = await createAppointment.mutateAsync({
            client_id: selectedClient,
            service_id: selectedService,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            notes: usingPaidServiceId ? `${notes ? notes + ' - ' : ''}Serviço pago utilizado` : (notes || undefined),
            professional_id: selectedProfessional || undefined,
            room_id: selectedRoom || undefined,
            payment_status: usingPaidServiceId ? 'paid' : 'pending',
          });

          // If using a paid service, mark it as used
          if (usingPaidServiceId) {
            await markServiceAsUsed.mutateAsync({
              serviceId: usingPaidServiceId,
              appointmentId: appointmentResult.id,
            });
          }
        }
      }

      onOpenChange(false);
      resetForm();
      setHolidayConfirmed(false);
    } catch (error) {
      console.error('Error creating appointment:', error);
    }
  };

  const resetForm = () => {
    setSelectedClient('');
    setSelectedService('');
    setSelectedProfessional('');
    setSelectedRoom('');
    setSelectedEquipment([]);
    setDate(undefined);
    setTime('');
    setNotes('');
    setAutoScheduleEnabled(false);
    setPreferredDayOfWeek(null);
    setPreferredTime('');
    setShowPreview(false);
    setPreviewDates([]);
    setServiceType('service');
    setServiceSearch('');
    setClientSearch('');
    setUsingPaidServiceId(null);
    // Reset recurring service states
    setRepeatServiceEnabled(false);
    setRepeatCount(4);
    setServiceIntervalDays(7);
    setServicePreviewDates([]);
    setEditableServiceDates([]);
    setEditingServiceDateIndex(null);
  };

  const hasConflicts = conflicts.length > 0;

  const selectedHoliday = date ? getHolidayForDate(date) : undefined;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle className="font-display text-xl">Novo Agendamento</DialogTitle>
          <DialogDescription>
            Preencha as informações para criar um novo agendamento
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-5" data-appointment-form="new">
            <div className="space-y-2 relative">
              <Label htmlFor="client">Cliente *</Label>
              <Input
                placeholder="Digite para buscar cliente..."
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setShowClientSuggestions(true);
                  if (!e.target.value) setSelectedClient('');
                }}
                onFocus={() => setShowClientSuggestions(true)}
              />
              {showClientSuggestions && clientSearch && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                  {activeClients
                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch))
                    .slice(0, 10)
                    .map(client => (
                      <div
                        key={client.id}
                        className="p-2 hover:bg-accent cursor-pointer"
                        onClick={() => {
                          setSelectedClient(client.id);
                          setClientSearch(client.name);
                          setShowClientSuggestions(false);
                        }}
                      >
                        <div className="font-medium">{client.name}</div>
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      </div>
                    ))}
                  {activeClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <div className="p-2 text-muted-foreground text-sm">Nenhum cliente encontrado</div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 relative">
              <Label>Serviço ou Pacote *</Label>
              <Input
                placeholder="Digite para buscar serviço ou pacote..."
                value={serviceSearch}
                onChange={(e) => {
                  setServiceSearch(e.target.value);
                  setShowServiceSuggestions(true);
                  setPackageQuickFilter('all');
                  if (!e.target.value) {
                    setSelectedService('');
                    setServiceType('service');
                  }
                }}
                onFocus={() => setShowServiceSuggestions(true)}
              />
              {showServiceSuggestions && (serviceSearch || selectedClient) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[350px] overflow-y-auto">
                  {(selectedClient || activePackages.length > 0) && (
                    <div className="border-b-2 border-primary/20">
                      {[
                        { value: 'all', label: 'Todos', detail: 'Serviços e pacotes' },
                        { value: 'standard', label: 'Pacotes', detail: 'Pacotes comuns' },
                        { value: 'sequential', label: 'Pacotes sequenciais', detail: 'Sequenciais' },
                      ].map(option => (
                        <div
                          key={option.value}
                          className="p-2 hover:bg-accent cursor-pointer border-b last:border-b-0 bg-primary/5"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setPackageQuickFilter(option.value as 'all' | 'standard' | 'sequential');
                            setServiceSearch('');
                            setShowServiceSuggestions(true);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-primary">{option.label}</span>
                            <Badge variant={packageQuickFilter === option.value ? 'default' : 'secondary'} className="text-xs gap-1">
                              <Package className="h-3 w-3" />
                              {option.detail}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Client's frequent services - shown as quick suggestions */}
                  {selectedClient && clientFrequentServices.length > 0 && !serviceSearch && (
                    <div className="border-b-2 border-amber-500/20">
                      <div className="px-3 py-1.5 text-xs font-semibold text-amber-600 bg-amber-500/10 flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Serviços Frequentes
                      </div>
                      {clientFrequentServices.map(service => (
                        <div
                          key={`freq-${service.id}`}
                          className="p-2 hover:bg-amber-500/10 cursor-pointer border-b bg-amber-500/5"
                          onClick={() => {
                            setSelectedService(service.id);
                            setServiceSearch(service.name);
                            setServiceType('service');
                            setUsingPaidServiceId(null);
                            setShowServiceSuggestions(false);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-amber-700">{service.name}</span>
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
                              {service.bookingCount}x agendado
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {service.duration}min • R$ {Number(service.price).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Client's paid services - shown first */}
                  {selectedClient && clientPaidServices.length > 0 && (
                    <div className="border-b-2 border-green-500/20">
                      <div className="px-3 py-1.5 text-xs font-semibold text-green-600 bg-green-500/10 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        Serviços Pagos do Cliente
                      </div>
                      {clientPaidServices
                        .filter(s => !serviceSearch || s.service?.name?.toLowerCase().includes(serviceSearch.toLowerCase()))
                        .map(paidService => (
                          <div
                            key={`client-svc-${paidService.id}`}
                            className="p-2 hover:bg-green-500/10 cursor-pointer border-b bg-green-500/5"
                            onClick={() => {
                              // Use the service.id from the joined service data for accuracy
                              const actualServiceId = paidService.service?.id || paidService.service_id;
                              setSelectedService(actualServiceId);
                              setServiceSearch(paidService.service?.name || '');
                              setServiceType('service');
                              setUsingPaidServiceId(paidService.id);
                              setShowServiceSuggestions(false);
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-green-700">{paidService.service?.name}</span>
                              <Badge className="text-xs bg-green-500 text-white">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                PAGO
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {paidService.service?.duration}min • Valor pago: R$ {Number(paidService.amount_paid).toFixed(2)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Client's packages (paid and pending) */}
                  {selectedClient && visibleClientPackages.length > 0 && (
                    <div className="border-b-2 border-primary/20">
                      <div className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Pacotes do Cliente
                      </div>
                      {visibleClientPackages
                        .map((pkg, index) => {
                          const summary = getPackageAvailabilitySummary(pkg);
                          const remaining = summary.schedulableSessions;
                          // Check if there are other packages with same name to show identifier
                          const sameNameCount = visibleClientPackages.filter(p => p.name === pkg.name).length;
                          const packageDate = pkg.created_at ? format(new Date(pkg.created_at), 'dd/MM/yy', { locale: ptBR }) : '';
                          // Check if package is paid (has payment_methods set from caixa sale)
                          const isPaid = pkg.payment_methods && pkg.payment_methods.length > 0;
                          
                          return (
                            <div
                              key={`client-pkg-${pkg.id}`}
                              className={cn(
                                "p-2 cursor-pointer border-b",
                                isPaid ? "hover:bg-green-500/10 bg-green-500/5" : "hover:bg-primary/5 bg-primary/5"
                              )}
                              onClick={() => {
                                setSelectedService(pkg.id);
                                setServiceSearch(`${pkg.name}${sameNameCount > 1 ? ` (${packageDate})` : ''}`);
                                setServiceType('package');
                                setUsingPaidServiceId(null);
                                setShowServiceSuggestions(false);
                              }}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <span className={cn("font-medium", isPaid ? "text-green-700" : "text-primary")}>{pkg.name}</span>
                                  {sameNameCount > 1 && (
                                    <span className="text-xs text-muted-foreground">({packageDate})</span>
                                  )}
                                </div>
                                {isPaid ? (
                                  <Badge className="text-xs bg-green-500 text-white">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    PAGO
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                    PENDENTE
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Dá para agendar: {remaining} • Sessões existentes: {summary.existingSessionRecords}/{summary.totalSessions}
                                {summary.hasInconsistentCounter ? ' • contador antigo divergente' : ''}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  
                  {/* Regular Services */}
                  {services
                    .filter(s => s.is_active && s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                    .slice(0, 5)
                    .map(service => (
                      <div
                        key={service.id}
                        className="p-2 hover:bg-accent cursor-pointer border-b"
                        onClick={() => {
                          setSelectedService(service.id);
                          setServiceSearch(service.name);
                          setServiceType('service');
                          setShowServiceSuggestions(false);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{service.name}</span>
                          <Badge variant="outline" className="text-xs">Serviço</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {service.duration}min • R$ {Number(service.price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  {/* Packages (templates) */}
                  {visibleCatalogPackages
                    .slice(0, 5)
                    .map(pkg => (
                      <div
                        key={pkg.id}
                        className="p-2 hover:bg-accent cursor-pointer border-b"
                        onClick={() => {
                          setSelectedService(pkg.id);
                          setServiceSearch(pkg.name);
                          setServiceType('package');
                          setShowServiceSuggestions(false);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{pkg.name}</span>
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Package className="h-3 w-3" />
                            Pacote
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pkg.total_sessions} sessões • R$ {Number(pkg.total_price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  {services.filter(s => s.is_active && s.name.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0 &&
                   visibleCatalogPackages.length === 0 &&
                   (!selectedClient || visibleClientPackages.length === 0) && (
                    <div className="p-2 text-muted-foreground text-sm">Nenhum serviço ou pacote encontrado</div>
                   )}
                </div>
              )}
              {selectedServiceData && serviceType === 'service' && (
                <div className="mt-2 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Duração: {selectedServiceData.duration} minutos • 
                    Valor: R$ {Number(selectedServiceData.price).toFixed(2)}
                    {selectedServiceData.return_days && ` • Retorno: ${selectedServiceData.return_days} dias`}
                  </p>
                  
                  {/* Recurring service options - only if not using a paid service */}
                  {selectedClient && !usingPaidServiceId && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            <Repeat className="h-4 w-4" />
                            Repetir Agendamento
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Criar múltiplos agendamentos automaticamente
                          </p>
                        </div>
                        <Switch
                          checked={repeatServiceEnabled}
                          onCheckedChange={setRepeatServiceEnabled}
                        />
                      </div>

                      {repeatServiceEnabled && (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Quantidade de vezes</Label>
                              <Select
                                value={repeatCount.toString()}
                                onValueChange={(v) => setRepeatCount(parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map(num => (
                                    <SelectItem key={num} value={num.toString()}>
                                      {num} agendamentos
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Intervalo (dias)</Label>
                              <Select
                                value={serviceIntervalDays.toString()}
                                onValueChange={(v) => setServiceIntervalDays(parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[7, 14, 21, 28, 30, 45, 60, 90].map(days => (
                                    <SelectItem key={days} value={days.toString()}>
                                      A cada {days} dias
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Horário preferido</Label>
                            <Input
                              type="time"
                              className="h-8 text-xs"
                              value={preferredTime}
                              onChange={(e) => setPreferredTime(e.target.value)}
                              placeholder="Mesmo horário do primeiro"
                            />
                            {!preferredTime && (
                              <p className="text-[10px] text-muted-foreground">Deixe vazio para manter o mesmo horário</p>
                            )}
                          </div>

                          {/* WhatsApp notification toggle for recurring services */}
                          <div className="flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/20">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-medium">Notificar por WhatsApp</span>
                            </div>
                            <Switch
                              checked={sendWhatsappNotification}
                              onCheckedChange={setSendWhatsappNotification}
                            />
                          </div>

                          {/* Preview of scheduled dates */}
                          {editableServiceDates.length > 0 && date && time && (
                            <div className="mt-2 p-3 bg-background rounded-md border max-h-[220px] overflow-y-auto">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4 text-primary" />
                                  <span className="text-sm font-medium">Agendamentos ({editableServiceDates.length})</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Clique para editar</span>
                              </div>
                              
                              {hasServicePreviewConflicts && (
                                <Alert variant="destructive" className="mb-2 py-2">
                                  <AlertTriangle className="h-3 w-3" />
                                  <AlertDescription className="text-xs">
                                    Alguns horários têm conflitos. Clique para ajustar.
                                  </AlertDescription>
                                </Alert>
                              )}
                              
                              <div className="space-y-1.5">
                                {editableServiceDates.map((previewDate, index) => {
                                  const conflictInfo = servicePreviewConflicts.find(pc => pc.index === index);
                                  const hasConflict = conflictInfo && conflictInfo.conflicts.length > 0;
                                  
                                  return (
                                    <div 
                                      key={index} 
                                      className={cn(
                                        "flex items-center gap-2 text-xs py-1 px-2 rounded",
                                        hasConflict ? "bg-destructive/10" : "bg-muted/50"
                                      )}
                                    >
                                      <span className="w-5 text-muted-foreground font-medium">{index + 1}.</span>
                                      {editingServiceDateIndex === index ? (
                                        <div className="flex-1 flex gap-2">
                                          <Input
                                            type="datetime-local"
                                            className="h-7 text-xs"
                                            defaultValue={format(previewDate, "yyyy-MM-dd'T'HH:mm")}
                                            onChange={(e) => {
                                              const newDate = new Date(e.target.value);
                                              if (!isNaN(newDate.getTime())) {
                                                updateEditableServiceDate(index, newDate);
                                              }
                                            }}
                                            onBlur={() => setEditingServiceDateIndex(null)}
                                            autoFocus
                                          />
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          className={cn(
                                            "flex-1 text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors flex items-center justify-between",
                                            index === 0 ? "font-medium" : "text-muted-foreground",
                                            hasConflict && "text-destructive"
                                          )}
                                          onClick={() => setEditingServiceDateIndex(index)}
                                        >
                                          <span className="truncate">{format(previewDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                                          <Pencil className="h-3 w-3 opacity-50 shrink-0 ml-1" />
                                        </button>
                                      )}
                                      {index === 0 && !hasConflict && <Badge variant="secondary" className="text-[10px] shrink-0">Primeira</Badge>}
                                      {hasConflict && (
                                        <Badge variant="destructive" className="text-[10px] shrink-0">Conflito</Badge>
                                      )}
                                      {hasConflict && conflictInfo?.suggestedDate && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 text-[10px] px-1.5 text-primary"
                                          onClick={() => updateEditableServiceDate(index, conflictInfo.suggestedDate!)}
                                        >
                                          Sugerir: {format(conflictInfo.suggestedDate, "dd/MM HH:mm")}
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* WhatsApp notification option */}
                          <div className="flex items-center justify-between pt-2 border-t">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="h-4 w-4 text-green-600" />
                              <span className="text-xs">Notificar cliente via WhatsApp</span>
                            </div>
                            <Switch
                              checked={sendWhatsappNotification}
                              onCheckedChange={setSendWhatsappNotification}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {selectedPackageData && serviceType === 'package' && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Duração: {selectedPackageData.duration || 60} minutos • 
                    {selectedPackageData.total_sessions} sessões • 
                    Valor: R$ {Number(selectedPackageData.total_price).toFixed(2)}
                  </p>
                  
                  {/* Show remaining sessions for existing package */}
                  {existingClientPackage && selectedClient && (
                    <Alert className="py-2">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-sm space-y-1">
                        <div>
                          <span className="font-medium">
                            Dá para agendar: {selectedPackageAvailability?.schedulableSessions ?? packageRemainingSessions}
                          </span>
                          {' '}• Sessões existentes: {selectedPackageAvailability?.existingSessionRecords ?? 0}/{selectedPackageAvailability?.totalSessions ?? existingClientPackage.total_sessions}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Consumidas: {selectedPackageAvailability?.consumedSessions ?? 0} • Já agendadas: {selectedPackageAvailability?.scheduledAppointments ?? existingClientPackage.sessions_scheduled}
                          {selectedPackageAvailability?.hasInconsistentCounter ? ' • contador antigo divergente ignorado' : ''}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Show auto-schedule options for new package OR first appointment of existing package */}
                  {((!existingClientPackage && selectedClient) || 
                    (existingClientPackage && selectedClient && !existingPackageHasStarted)) && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Agendamento Automático</Label>
                          <p className="text-xs text-muted-foreground">
                            Agendar todas as {existingClientPackage?.total_sessions || selectedPackageData?.total_sessions} sessões automaticamente
                          </p>
                        </div>
                        <Switch
                          checked={autoScheduleEnabled}
                          onCheckedChange={setAutoScheduleEnabled}
                        />
                      </div>

                      {autoScheduleEnabled && (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Dia preferido</Label>
                              <Select
                                value={preferredDayOfWeek !== null ? preferredDayOfWeek.toString() : '_any'}
                                onValueChange={(v) => setPreferredDayOfWeek(v === '_any' ? null : parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Qualquer dia" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_any">Qualquer dia</SelectItem>
                                  {DAYS_OF_WEEK.map(day => (
                                    <SelectItem key={day.value} value={day.value.toString()}>
                                      {day.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Horário preferido</Label>
                              <Select
                                value={preferredTime || '_same'}
                                onValueChange={(v) => setPreferredTime(v === '_same' ? '' : v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Mesmo horário" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                  <SelectItem value="_same">Mesmo horário</SelectItem>
                                  {timeSlots.map(slot => (
                                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Intervalo: a cada {existingClientPackage?.interval_days || selectedPackageData?.interval_days || 7} dias
                          </p>

                          {/* Preview of scheduled dates with edit capability */}
                          {editablePreviewDates.length > 0 && date && time && (
                            <div className="mt-3 p-3 bg-background rounded-md border max-h-[280px] overflow-y-auto">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4 text-primary" />
                                  <span className="text-sm font-medium">Visualização das Sessões</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Clique para editar</span>
                              </div>
                              {hasPreviewConflicts && (
                                <Alert variant="destructive" className="mb-2 py-2">
                                  <AlertTriangle className="h-3 w-3" />
                                  <AlertDescription className="text-xs">
                                    Algumas datas têm conflitos. Altere ou aceite as sugestões.
                                  </AlertDescription>
                                </Alert>
                              )}
                              <div className="space-y-2">
                                {editablePreviewDates.map((previewDate, index) => {
                                  const conflictInfo = previewDateConflicts.find(pc => pc.index === index);
                                  const hasConflict = conflictInfo && conflictInfo.conflicts.length > 0;
                                  
                                  return (
                                    <div key={index} className="space-y-1">
                                      <div className={cn(
                                        "flex items-center gap-2 text-xs p-1 rounded",
                                        hasConflict && "bg-destructive/10 border border-destructive/30"
                                      )}>
                                        <Badge 
                                          variant={hasConflict ? "destructive" : index === 0 ? "default" : "outline"} 
                                          className="w-6 h-6 p-0 flex items-center justify-center text-[10px] shrink-0"
                                        >
                                          {hasConflict ? <AlertTriangle className="h-3 w-3" /> : index + 1}
                                        </Badge>
                                        {editingDateIndex === index ? (
                                          <div className="flex items-center gap-1 flex-1">
                                            <Input
                                              type="datetime-local"
                                              className="h-7 text-xs flex-1"
                                              value={format(previewDate, "yyyy-MM-dd'T'HH:mm")}
                                              onChange={(e) => {
                                                const newDate = new Date(e.target.value);
                                                if (!isNaN(newDate.getTime())) {
                                                  updateEditableDate(index, newDate);
                                                }
                                              }}
                                              onBlur={() => setEditingDateIndex(null)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') setEditingDateIndex(null);
                                              }}
                                              autoFocus
                                            />
                                          </div>
                                        ) : (
                                        <button
                                            type="button"
                                            className={cn(
                                              "flex-1 text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors flex items-center justify-between",
                                              index === 0 ? "font-medium" : "text-muted-foreground",
                                              hasConflict && "text-destructive"
                                            )}
                                            onClick={() => setEditingDateIndex(index)}
                                          >
                                            <span className="truncate">{format(previewDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                                            <Pencil className="h-3 w-3 opacity-50 shrink-0 ml-1" />
                                          </button>
                                        )}
                                        {index === 0 && !hasConflict && <Badge variant="secondary" className="text-[10px] shrink-0">Primeira</Badge>}
                                      </div>
                                      
                                      {/* Show conflict details and suggestion */}
                                      {hasConflict && conflictInfo && (
                                        <div className="ml-8 space-y-1">
                                          <p className="text-[10px] text-destructive">
                                            {conflictInfo.conflicts[0].message}
                                          </p>
                                          {conflictInfo.suggestedDate && (
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-6 text-[10px] px-2 bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                                              onClick={() => updateEditableDate(index, conflictInfo.suggestedDate!)}
                                            >
                                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                                              Usar: {format(conflictInfo.suggestedDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* WhatsApp notification toggle */}
                          {editablePreviewDates.length > 0 && (
                            <div className="mt-3 flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/20">
                              <div className="flex items-center gap-2">
                                <MessageCircle className="h-4 w-4 text-green-600" />
                                <span className="text-xs font-medium">Notificar por WhatsApp</span>
                              </div>
                              <Switch
                                checked={sendWhatsappNotification}
                                onCheckedChange={setSendWhatsappNotification}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <SearchableSelect
                options={activeProfessionals.map(p => ({
                  value: p.id,
                  label: p.name,
                  color: p.agenda_color || undefined,
                }))}
                value={selectedProfessional}
                onChange={setSelectedProfessional}
                placeholder="Selecione um profissional (opcional)"
                searchPlaceholder="Buscar profissional..."
                emptyMessage="Nenhum profissional encontrado"
              />
            </div>

            <div className="space-y-2">
              <Label>Sala</Label>
              <SearchableSelect
                options={activeRooms.map(r => ({
                  value: r.id,
                  label: r.name,
                }))}
                value={selectedRoom}
                onChange={setSelectedRoom}
                placeholder="Selecione uma sala (opcional)"
                searchPlaceholder="Buscar sala..."
                emptyMessage="Nenhuma sala encontrada"
              />
            </div>

            <div className="space-y-2">
              <Label>Equipamentos</Label>
              <Select 
                value={selectedEquipment[0] || ''} 
                onValueChange={(val) => setSelectedEquipment(val ? [val] : [])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione equipamento (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {activeEquipment.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEquipment.length > 0 && selectedEquipment[0] !== '_none' && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedEquipment.filter(id => id !== '_none').map(eqId => {
                    const eq = activeEquipment.find(e => e.id === eqId);
                    return eq ? (
                      <Badge key={eqId} variant="secondary" className="text-xs">
                        {eq.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                      disabled={(date) => {
                        // Disable past dates
                        if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
                        // Disable non-work days
                        if (!isWorkDay(date)) return true;
                        return false;
                      }}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Horário *</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="pl-9"
                      placeholder="HH:MM"
                    />
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" type="button" className="shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 z-50" align="end">
                      <p className="text-xs font-medium mb-2">Horários sugeridos</p>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-1">
                          {availableSlots.map(({ slot, isAvailable, conflictReason }) => (
                            <Button
                              key={slot}
                              variant={time === slot ? "default" : "ghost"}
                              size="sm"
                              type="button"
                              className={cn(
                                "w-full justify-start text-left h-8",
                                !isAvailable && "opacity-50"
                              )}
                              onClick={() => {
                                setTime(slot);
                              }}
                            >
                              <div className="flex items-center gap-2 w-full">
                                {isAvailable ? (
                                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                                )}
                                <span>{slot}</span>
                                {!isAvailable && (
                                  <span className="text-[10px] text-destructive ml-auto">({conflictReason})</span>
                                )}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-[10px] text-muted-foreground">Digite qualquer horário ou clique no ícone para sugestões</p>
              </div>
            </div>

            {/* Show appointment summary */}
            {date && time && selectedServiceData && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium mb-1">Resumo do Agendamento</p>
                <p className="text-xs text-muted-foreground">
                  {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })} às {time}
                </p>
                <p className="text-xs text-muted-foreground">
                  Término previsto: {appointmentTimes && format(appointmentTimes.endTime, 'HH:mm')}
                </p>
              </div>
            )}

            {/* Business hours warning */}
            {businessHoursError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">{businessHoursError}</AlertDescription>
              </Alert>
            )}

            {/* Conflict warnings */}
            {hasConflicts && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  {conflicts.map((conflict, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {conflict.type === 'professional' ? 'Profissional' : 
                         conflict.type === 'room' ? 'Sala' : 
                         conflict.type === 'absence' ? 'Ausência' : 'Equipamento'}
                      </Badge>
                      <span className="text-sm">{conflict.message}</span>
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Alguma observação sobre o agendamento..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="flex-1"
                disabled={!selectedClient || !selectedService || !date || !time || hasConflicts || hasPreviewConflicts || hasServicePreviewConflicts || !!businessHoursError || createAppointment.isPending || createRecurringAppointments.isPending}
              >
                {(createAppointment.isPending || createRecurringAppointments.isPending) ? 'Salvando...' : (hasPreviewConflicts || hasServicePreviewConflicts) ? 'Resolva os conflitos' : repeatServiceEnabled ? `Criar ${editableServiceDates.length} Agendamentos` : 'Criar Agendamento'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showHolidayConfirm} onOpenChange={setShowHolidayConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Data em feriado</AlertDialogTitle>
          <AlertDialogDescription>
            A data selecionada é feriado: {selectedHoliday?.name}. Deseja continuar com este agendamento?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setHolidayConfirmed(true);
              setShowHolidayConfirm(false);
              requestAnimationFrame(() => {
                document.querySelector<HTMLFormElement>('[data-appointment-form="new"]')?.requestSubmit();
              });
            }}
          >
            Continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
