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
import { formatDurationClock, addMinutesToClock } from '@/lib/duration';
import { resolveSessionServiceLabel } from '@/lib/packageStepLabel';
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
import { WhatsappPreviewDialog } from '@/components/shared/WhatsappPreviewDialog';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useBrazilianHolidays } from '@/hooks/useBrazilianHolidays';
import { Appointment } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getPackageAvailabilitySummary } from '@/lib/packageAvailability';
import { createDateTimeInTimeZone } from '@/lib/timezone';
import { calculateAppointmentTimesInTimeZone, getAvailabilityConflictReason } from '@/lib/appointmentScheduling';
import {
  ProfessionalCommissionField,
  saveCommissionOverride,
  defaultCommissionOverride,
  type CommissionOverride,
} from '@/components/services/ProfessionalCommissionField';
import { useQueryClient } from '@tanstack/react-query';

interface ConflictInfo {
  type: 'professional' | 'room' | 'equipment' | 'absence' | 'series';
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
  const [commissionOverride, setCommissionOverride] = useState<CommissionOverride>(defaultCommissionOverride);
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('');
  const [endTimeOverride, setEndTimeOverride] = useState('');
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
  // Permite o usuário sobrescrever manualmente o intervalo (em dias) entre as sessões do pacote
  const [customIntervalDays, setCustomIntervalDays] = useState<string>('');
  
  // Recurring service settings (for regular services, not packages)
  const [repeatServiceEnabled, setRepeatServiceEnabled] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);
  const [serviceIntervalDays, setServiceIntervalDays] = useState(7);
  const [servicePreferredDayOfWeek, setServicePreferredDayOfWeek] = useState<number | null>(null);
  const [servicePreviewDates, setServicePreviewDates] = useState<Date[]>([]);
  const [editableServiceDates, setEditableServiceDates] = useState<Date[]>([]);
  const [editingServiceDateIndex, setEditingServiceDateIndex] = useState<number | null>(null);
  const [showHolidayConfirm, setShowHolidayConfirm] = useState(false);
  const [holidayConfirmed, setHolidayConfirmed] = useState(false);

  // WhatsApp preview dialog (shown after creating appointments if toggle on)
  const [whatsappPreviewOpen, setWhatsappPreviewOpen] = useState(false);
  const [whatsappPreviewPhone, setWhatsappPreviewPhone] = useState<string | undefined>(undefined);
  const [whatsappPreviewMessage, setWhatsappPreviewMessage] = useState('');

  // Discount applied when scheduling
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountApplyToAll, setDiscountApplyToAll] = useState(false);


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

  // Strict business day: Mon-Fri and not a national holiday.
  // Used for "Qualquer dia útil" recurring selections — ignores work_saturdays
  // (Saturday never counts as business day) and always skips holidays.
  const isBusinessDay = useCallback((date: Date): boolean => {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    const holiday = getHolidayForDate(date);
    if (holiday && holiday.type === 'national') return false;
    return true;
  }, [getHolidayForDate]);
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
  // Available paid applications of the SAME service the user picked from "Serviços Pagos"
  const paidSiblings = (clientPaidServices || []).filter(
    (p: any) => ((p.service?.id || p.service_id) === selectedService) && p.status === 'available',
  );
  const paidSiblingCount = paidSiblings.length;
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
      setDiscountValue(0);
      setDiscountApplyToAll(false);

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
  // IMPORTANTE: o horário de término é derivado do horário de início + duração
  // usando aritmética de minutos no relógio de parede (HH:mm) para evitar
  // qualquer deslocamento por fuso horário (bug reportado: início 08:00 mostrava
  // término 20:40 quando o fuso do navegador divergia do fuso da conta).
  // Etapas do pacote sequencial (declaradas antes de appointmentTimes para
  // que a duração use a etapa correta, não o total do pacote).
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

  const nextPackageStepService = useMemo(() => {
    const packageData = existingClientPackage || selectedPackageData;
    if (!packageData) return null;
    if (packageData.package_type === 'sequential') {
      const sessions = (existingClientPackage as any)?.appointments as any[] | undefined;
      if (sessions?.length) {
        const pending = [...sessions]
          .sort((a, b) => (a.sequence_order || a.session_number || 0) - (b.sequence_order || b.session_number || 0))
          .find((s) => !s.appointment_id && s.status === 'pending');
        const svcId = pending?.service_id || packageSequenceSteps[0]?.service_id;
        return svcId ? services.find((s) => s.id === svcId) || null : null;
      }
      const svcId = packageSequenceSteps[0]?.service_id;
      return svcId ? services.find((s) => s.id === svcId) || null : null;
    }
    const svcId = (packageData as any)?.service_id;
    return svcId ? services.find((s) => s.id === svcId) || null : null;
  }, [existingClientPackage, selectedPackageData, packageSequenceSteps, services]);

  const appointmentTimes = useMemo(() => {
    if (!date || !time) return null;

    // Para pacote sequencial, a duração de cada agendamento é a duração do
    // serviço da ETAPA atual (Avaliação, Axila+Virilha, etc.) — não a soma
    // do pacote inteiro. Caso contrário, término = 08:00 + 12h40 = 20:40.
    const isSequential = selectedPackageData?.package_type === 'sequential';
    const stepDuration = (nextPackageStepService as any)?.duration;
    const duration = serviceType === 'service'
      ? (selectedServiceData?.duration || 60)
      : (isSequential ? (stepDuration || 60) : (selectedPackageData?.duration || 60));

    const startTime = createDateTimeInTimeZone(date, time, settings?.timezone);

    // Deriva o rótulo do término em relógio de parede (24h) e depois
    // reconstroi o Date no mesmo fuso — assim UI e persistência batem.
    const autoEndLabel = addMinutesToClock(time, duration);

    // Se o usuário sobrescreveu manualmente o término, respeita.
    const effectiveEndLabel = (endTimeOverride && /^\d{2}:\d{2}$/.test(endTimeOverride))
      ? endTimeOverride
      : autoEndLabel;

    let endTime: Date;
    if (effectiveEndLabel && /^\d{2}:\d{2}$/.test(effectiveEndLabel)) {
      endTime = createDateTimeInTimeZone(date, effectiveEndLabel, settings?.timezone);
      // Se o término cair antes do início (virou o dia por sobra > 24h), fallback para start+duração em ms.
      if (endTime <= startTime) {
        endTime = new Date(startTime.getTime() + duration * 60_000);
      }
    } else {
      endTime = new Date(startTime.getTime() + duration * 60_000);
    }

    return { startTime, endTime, endLabel: effectiveEndLabel };
  }, [date, time, endTimeOverride, selectedServiceData, selectedPackageData, serviceType, settings?.timezone]);

  // Reset end-time override when start time or service/package changes
  useEffect(() => {
    setEndTimeOverride('');
  }, [time, selectedService, selectedPackageData?.id, serviceType]);

  // Calculate preview dates for auto-scheduling

  const calculatePreviewDates = useMemo(() => {
    if (!appointmentTimes || !autoScheduleEnabled) return [];
    
    const packageData = existingClientPackage || selectedPackageData;
    const totalSessions = packageData?.total_sessions || 1;
    if (totalSessions <= 1) return [];

    const workSundays = settings?.work_sundays ?? false;
    const workSaturdays = settings?.work_saturdays ?? true;

    const dates: Date[] = [appointmentTimes.startTime];
    let currentDate = appointmentTimes.startTime;

    for (let i = 1; i < totalSessions; i++) {
      const previousStep = packageSequenceSteps[i - 1];
      // Para pacotes sequenciais, o intervalo ENTRE a etapa i-1 e a etapa i é
      // sempre `previousStep.interval_after_days` (semântica "dias APÓS esta
      // etapa"). Bug anterior usava o intervalo da própria etapa i, o que
      // ignorava o gap real cadastrado (ex.: 3 dias entre avaliação e axila
      // virava 21 dias porque pegava o intervalo da axila para a próxima).
      const manualOverride = parseInt(customIntervalDays, 10);
      const hasManualOverride = !isNaN(manualOverride) && manualOverride > 0;
      const rawInterval = packageSequenceSteps.length > 0
        ? Number(previousStep?.interval_after_days ?? packageData?.interval_days ?? 7)
        : hasManualOverride
          ? manualOverride
          : Number(packageData?.interval_days || 7);
      const intervalDays = Number.isFinite(rawInterval) ? rawInterval : 7;
      // Ensure minimum 1 day interval to prevent overlapping sessions
      const safeInterval = Math.max(intervalDays, 1);
      const futureDate = addDays(currentDate, safeInterval);
      
      // Adjust to preferred day of week if set
      if (preferredDayOfWeek !== null) {
        while (futureDate.getDay() !== preferredDayOfWeek) {
          futureDate.setDate(futureDate.getDate() + 1);
        }
        // Skip holidays even when a specific weekday is chosen (jump 7 days
        // to keep the same weekday)
        while (getHolidayForDate(futureDate)?.type === 'national') {
          futureDate.setDate(futureDate.getDate() + 7);
        }
      } else {
        // "Qualquer dia útil": strictly Mon-Fri and no national holidays
        while (!isBusinessDay(futureDate)) {
          futureDate.setDate(futureDate.getDate() + 1);
        }
      }

      // Apply preferred time if set
      if (preferredTime) {
        const zonedFutureDate = createDateTimeInTimeZone(futureDate, preferredTime, settings?.timezone);
        futureDate.setTime(zonedFutureDate.getTime());
      }

      dates.push(new Date(futureDate));
      currentDate = futureDate;
    }

    return dates;
  }, [appointmentTimes, autoScheduleEnabled, existingClientPackage, selectedPackageData, packageSequenceSteps, preferredDayOfWeek, preferredTime, customIntervalDays, settings?.timezone, settings?.work_sundays, settings?.work_saturdays, isBusinessDay, getHolidayForDate]);

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

    const duration = selectedServiceData?.duration || 60;
    const dates: Date[] = [appointmentTimes.startTime];

    // Helper: check whether a given start collides with siblings already placed
    const collidesWithSiblings = (start: Date) => {
      const end = new Date(start.getTime() + duration * 60_000);
      return dates.some((d) => {
        const dEnd = new Date(d.getTime() + duration * 60_000);
        return start < dEnd && end > d;
      });
    };

    for (let i = 1; i < repeatCount; i++) {
      let futureDate = addDays(appointmentTimes.startTime, effectiveIntervalDays * i);

      // If a preferred weekday is set, jump to the next occurrence of that weekday
      if (servicePreferredDayOfWeek !== null) {
        const current = futureDate.getDay();
        const diff = (servicePreferredDayOfWeek - current + 7) % 7;
        if (diff !== 0) futureDate = addDays(futureDate, diff);
        // Skip holidays keeping the same weekday
        while (getHolidayForDate(futureDate)?.type === 'national') {
          futureDate = addDays(futureDate, 7);
        }
      } else {
        // "Qualquer dia útil": strictly Mon-Fri and not a national holiday
        while (!isBusinessDay(futureDate)) {
          futureDate = addDays(futureDate, 1);
        }
      }

      // Apply preferred time if set
      if (preferredTime) {
        futureDate = createDateTimeInTimeZone(futureDate, preferredTime, settings?.timezone);
      }

      // Avoid collisions with siblings already placed in the same series
      let guard = 0;
      while (collidesWithSiblings(futureDate) && guard++ < 60) {
        futureDate = addDays(futureDate, 1);
        if (servicePreferredDayOfWeek !== null) {
          while (futureDate.getDay() !== servicePreferredDayOfWeek || getHolidayForDate(futureDate)?.type === 'national') {
            futureDate = addDays(futureDate, 1);
          }
        } else {
          while (!isBusinessDay(futureDate)) futureDate = addDays(futureDate, 1);
        }
        if (preferredTime) {
          futureDate = createDateTimeInTimeZone(futureDate, preferredTime, settings?.timezone);
        }
      }

      dates.push(new Date(futureDate));
    }

    return dates;
  }, [appointmentTimes, repeatServiceEnabled, repeatCount, effectiveIntervalDays, serviceType, preferredTime, servicePreferredDayOfWeek, selectedServiceData?.duration, isWorkDay, isBusinessDay, getHolidayForDate, settings?.timezone]);

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
        // Guarda: só considerar ausências válidas do profissional selecionado.
        // Bug anterior mostrava "profissional ausente" quando havia ausência
        // com datas inválidas/invertidas ou de outro profissional cacheada.
        if (!absence?.professional_id || absence.professional_id !== selectedProfessional) return;
        const absenceStart = new Date(absence.start_time);
        const absenceEnd = new Date(absence.end_time);
        if (isNaN(absenceStart.getTime()) || isNaN(absenceEnd.getTime())) return;
        if (absenceEnd <= absenceStart) return;

        const overlaps = checkStart < absenceEnd && checkEnd > absenceStart;
        if (overlaps) {
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
        const timeSlotIndex = timeSlots.findIndex(slot => slot === format(previewDate, 'HH:mm'));
        
        // Try next slots on the same day
        for (let i = timeSlotIndex + 1; i < timeSlots.length; i++) {
          const testDate = createDateTimeInTimeZone(previewDate, timeSlots[i], settings?.timezone);
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
  }, [editablePreviewDates, autoScheduleEnabled, appointments, absences, selectedProfessional, selectedRoom, serviceType, selectedServiceData, selectedPackageData, timeSlots, settings?.timezone]);

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

      // Detect overlap with siblings within the same series being created
      editableServiceDates.forEach((other, otherIdx) => {
        if (otherIdx === index) return;
        const otherEnd = new Date(other.getTime() + duration * 60_000);
        if (previewDate < otherEnd && endTime > other) {
          dateConflicts.push({
            type: 'series',
            message: `Conflito com a sessão ${otherIdx + 1} desta série (${format(other, 'dd/MM HH:mm')})`,
          } as ConflictInfo);
        }
      });
      
      // Find alternative if there are conflicts
      let suggestedDate: Date | null = null;
      if (dateConflicts.length > 0) {
        // Try to find an available slot on the same day first
        const timeSlotIndex = timeSlots.findIndex(slot => slot === format(previewDate, 'HH:mm'));
        
        // Try next slots on the same day
        for (let i = timeSlotIndex + 1; i < timeSlots.length; i++) {
          const testDate = createDateTimeInTimeZone(previewDate, timeSlots[i], settings?.timezone);
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
  }, [editableServiceDates, repeatServiceEnabled, appointments, absences, selectedProfessional, selectedRoom, serviceType, selectedServiceData, timeSlots, isWorkDay, settings?.timezone]);

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
      // Exclude package-linked sessions: they belong to a package, not to a standalone service.
      // Counting them here causes "Axila 10x agendado" when the client only owns a package.
      const isPackageSession = !!(apt as any).package_appointment_id || !!(apt as any).package_appointment?.id;
      if (
        apt.client_id === selectedClient &&
        apt.service_id &&
        !isPackageSession &&
        !['cancelled', 'missed', 'rescheduled'].includes(apt.status)
      ) {
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

      const { startTime: slotStart, endTime: slotEnd } = calculateAppointmentTimesInTimeZone(date, slot, duration, settings?.timezone);
      const conflictReason = getAvailabilityConflictReason(slotStart, slotEnd, { appointments, absences, selectedProfessional, selectedRoom });
      const isAvailable = !conflictReason;

      return { slot, isAvailable, conflictReason };
    });
  }, [date, selectedServiceData, appointments, absences, selectedProfessional, selectedRoom, timeSlots, settings?.timezone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isPackageAppointment = serviceType === 'package';
    const serviceOrPackage = isPackageAppointment ? selectedPackageData : selectedServiceData;
    
    // For packages, selectedService contains the package ID, not service ID
    // For services, selectedService must be a valid service ID
    if (!selectedClient || !date || !time || !serviceOrPackage) {
      return;
    }

    if (!selectedProfessional) {
      toast.error('Selecione um profissional para o agendamento.');
      return;
    }

    if (activeRooms.length > 1 && !selectedRoom) {
      toast.error('Selecione uma sala para o agendamento.');
      return;
    }


    // Block if outside business hours
    if (businessHoursError) {
      toast.error(businessHoursError);
      return;
    }

    // Guarda: nenhum agendamento (manual ou automático) pode cair em um dia
    // em que o estabelecimento não trabalha (ex.: domingo com work_sundays=false).
    if (!isWorkDay(date)) {
      const dow = date.getDay();
      const dayName = dow === 0 ? 'domingos' : dow === 6 ? 'sábados' : 'este dia';
      toast.error(`O estabelecimento não atende aos ${dayName}. Escolha outra data.`);
      return;
    }
    if (autoScheduleEnabled && editablePreviewDates.some((d) => !isWorkDay(d))) {
      toast.error('Uma ou mais sessões automáticas caem em dias não trabalhados. Ajuste as datas.');
      return;
    }
    if (repeatServiceEnabled && editableServiceDates.some((d) => !isWorkDay(d))) {
      toast.error('Uma ou mais repetições caem em dias não trabalhados. Ajuste as datas.');
      return;
    }
    
    // For regular services, we need a service_id
    if (!isPackageAppointment && !selectedService) {
      return;
    }

    // Real-time revalidation: refetch agenda and re-check every recurring date
    // BEFORE persisting, so the professional resolves conflicts here — the
    // server never has to reject sessions after the fact.
    if ((repeatServiceEnabled && editableServiceDates.length > 1) || (autoScheduleEnabled && editablePreviewDates.length > 1)) {
      try {
        await queryClient.invalidateQueries({ queryKey: ['appointments'] });
        await queryClient.refetchQueries({ queryKey: ['appointments'] });
      } catch (err) {
        console.warn('Falha ao revalidar agenda antes de salvar:', err);
      }

      const datesToCheck = repeatServiceEnabled ? editableServiceDates : editablePreviewDates;
      const duration = (serviceType === 'service' ? selectedServiceData?.duration : selectedPackageData?.duration) || 60;
      const freshAppointments = (queryClient.getQueryData<any[]>(['appointments']) || appointments) as any[];

      const conflictingSessions: number[] = [];
      const seen: { start: Date; end: Date }[] = [];
      for (let i = 0; i < datesToCheck.length; i++) {
        const start = datesToCheck[i];
        const end = new Date(start.getTime() + duration * 60_000);
        // Sibling collision within this series
        const siblingCollision = seen.some((s) => start < s.end && end > s.start);
        // External collision (professional/room busy or professional absent)
        const externalCollision = freshAppointments.some((apt) => {
          if (['cancelled', 'rescheduled', 'missed'].includes(apt.status)) return false;
          const aptStart = new Date(apt.start_time);
          const aptEnd = new Date(apt.end_time);
          const overlaps = start < aptEnd && end > aptStart;
          if (!overlaps) return false;
          const aptProfId = apt.professional_id || apt.service?.professional_id;
          const aptRoomId = apt.room_id || apt.service?.room_id;
          if (selectedProfessional && aptProfId === selectedProfessional) return true;
          if (selectedRoom && aptRoomId === selectedRoom) return true;
          return false;
        });
        const absenceCollision = selectedProfessional && absences.some((abs) => {
          if (!abs?.professional_id || abs.professional_id !== selectedProfessional) return false;
          const aStart = new Date(abs.start_time);
          const aEnd = new Date(abs.end_time);
          if (isNaN(aStart.getTime()) || isNaN(aEnd.getTime()) || aEnd <= aStart) return false;
          return start < aEnd && end > aStart;
        });
        if (siblingCollision || externalCollision || absenceCollision) {
          conflictingSessions.push(i + 1);
        }
        seen.push({ start, end });
      }

      if (conflictingSessions.length > 0) {
        toast.error(
          `Sessões ${conflictingSessions.join(', ')} têm conflito de horário. Ajuste as datas antes de salvar.`,
          { duration: 8000 },
        );
        return;
      }
    }


    const holiday = getHolidayForDate(date);
    if (holiday && !holidayConfirmed) {
      setShowHolidayConfirm(true);
      return;
    }

    const duration = serviceOrPackage.duration || 60;
    const startTime = appointmentTimes?.startTime ?? createDateTimeInTimeZone(date, time, settings?.timezone);

    // Honor user-edited end time when valid; otherwise compute from duration
    const endTime = appointmentTimes?.endTime
      ? new Date(appointmentTimes.endTime)
      : new Date(startTime.getTime() + duration * 60000);

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
          notes: `${nextPackageStepService?.name ? nextPackageStepService.name + ' — ' : ''}${selectedPackageData.name}${notes ? ' - ' + notes : ''}`, // Session number will be added by incrementPackageSession
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
                notes: `${futureService?.name ? futureService.name + ' — ' : ''}${packageData?.name || selectedPackageData?.name}${notes ? ' - ' + notes : ''}`, // Session number will be added by incrementPackageSession
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
            toast.error(`Sessões ${failedSessions.join(', ')} não foram agendadas devido a conflitos de horário. Verifique a agenda e reagende manualmente.`, { duration: 8000 });
            toast.info(`${createdCount + 1} de ${sessionsToCreate + 1} agendamentos foram criados.`);
          } else {
            toast.success(`${createdCount + 1} agendamentos criados automaticamente!`);
          }

          // Compose WhatsApp notification and open preview (do NOT auto-send)
          if (sendWhatsappNotification && clientData?.phone) {
            const sessionsList = editablePreviewDates.map((d, i) =>
              `📅 Sessão ${i + 1}: ${format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
            ).join('\n');

            const message = `Olá ${clientData.name}! 👋

Seu pacote *${packageData?.name}* foi agendado com sucesso! 🎉

Confira as datas das suas ${totalSessions} sessões:

${sessionsList}

Se precisar reagendar alguma sessão, entre em contato conosco.

Até breve! ✨`;

            setWhatsappPreviewPhone(clientData.phone);
            setWhatsappPreviewMessage(message);
            setWhatsappPreviewOpen(true);
          }
        }
      } else {
        // Regular service appointment
        const clientData = clients.find(c => c.id === selectedClient);
        
        // Check if recurring appointments are enabled for this service
        if (repeatServiceEnabled && editableServiceDates.length > 1 && usingPaidServiceId) {
          // Paid service repeat: consume one paid sibling per appointment
          const siblings = paidSiblings.slice(0, editableServiceDates.length);
          if (siblings.length < editableServiceDates.length) {
            toast.error(
              `Aplicações insuficientes. Disponíveis: ${siblings.length}. Reduza a quantidade ou compre mais aplicações.`,
            );
            return;
          }
          const duration = selectedServiceData?.duration || 60;
          for (let i = 0; i < editableServiceDates.length; i++) {
            const start = editableServiceDates[i];
            const end = new Date(start.getTime() + duration * 60_000);
            const apt = await createAppointment.mutateAsync({
              client_id: selectedClient,
              service_id: selectedService,
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              notes: `Aplicação ${i + 1}/${editableServiceDates.length} — Aplicação de pacote${notes ? ` — ${notes}` : ''}`,
              professional_id: selectedProfessional || undefined,
              room_id: selectedRoom || undefined,
              payment_status: 'paid',
            });
            if (apt?.id) {
              await markServiceAsUsed.mutateAsync({
                serviceId: siblings[i].id,
                appointmentId: apt.id,
              });
            }
          }
        } else if (repeatServiceEnabled && editableServiceDates.length > 1 && !usingPaidServiceId) {
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
            // Preview handled below on the client; do NOT auto-send from the hook.
            send_whatsapp: false,
            client_phone: clientData?.phone,
            client_name: clientData?.name,
            service_name: selectedServiceData?.name,
            // Pass the custom edited dates so they are used exactly as the user configured
            custom_dates: editableServiceDates,
            duration_minutes: duration,
            // Aplicar desconto na série apenas se "aplicar em todos" estiver marcado
            discount_amount: discountValue > 0 && discountApplyToAll ? discountValue : 0,
          });

          // Compose WhatsApp preview from the dates the user configured
          if (sendWhatsappNotification && clientData?.phone) {
            const sessionsList = editableServiceDates.map((d, i) =>
              `📅 Sessão ${i + 1}: ${format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
            ).join('\n');
            const message = `Olá ${clientData.name || 'Cliente'}! 👋

Seus ${editableServiceDates.length} agendamentos de *${selectedServiceData?.name || 'serviço'}* foram criados com sucesso! 🎉

${sessionsList}

Se precisar reagendar alguma sessão, entre em contato conosco.

Até breve! ✨`;
            setWhatsappPreviewPhone(clientData.phone);
            setWhatsappPreviewMessage(message);
            setWhatsappPreviewOpen(true);
          }

          // If discount applies to only the first appointment (not "all"), update it after
          // creation. Since recurring runs in background, we defer with a small delay.
          if (discountValue > 0 && !discountApplyToAll) {
            setTimeout(async () => {
              const firstStart = editableServiceDates[0].toISOString();
              const { data: firstApt } = await supabase
                .from('appointments')
                .select('id')
                .eq('client_id', selectedClient)
                .eq('service_id', selectedService)
                .eq('start_time', firstStart)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (firstApt?.id) {
                await (supabase as any)
                  .from('appointments')
                  .update({ discount_amount: discountValue })
                  .eq('id', firstApt.id);
                queryClient.invalidateQueries({ queryKey: ['appointments'] });
              }
            }, 1500);
          }
        } else {
          // Single appointment
          const appointmentResult = await createAppointment.mutateAsync({
            client_id: selectedClient,
            service_id: selectedService,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            notes: usingPaidServiceId ? `${notes ? notes + ' - ' : ''}Aplicação de pacote` : (notes || undefined),
            professional_id: selectedProfessional || undefined,
            room_id: selectedRoom || undefined,
            payment_status: usingPaidServiceId ? 'paid' : 'pending',
          });

          // Apply discount (if any) on the freshly created appointment
          if (discountValue > 0 && appointmentResult?.id) {
            await (supabase as any)
              .from('appointments')
              .update({ discount_amount: discountValue })
              .eq('id', appointmentResult.id);
          }

          // If using a paid service, mark it as used
          if (usingPaidServiceId) {
            await markServiceAsUsed.mutateAsync({
              serviceId: usingPaidServiceId,
              appointmentId: appointmentResult.id,
            });
          }

          // === Kit composto: cria a cadeia de agendamentos seguintes ===
          const composedItems: Array<{ service_id: string; interval_days: number; price: number }> =
            Array.isArray((selectedServiceData as any)?.service_components)
              ? ((selectedServiceData as any).service_components as any[]).map((c) => ({
                  service_id: String(c.service_id),
                  interval_days: Number(c.interval_days) || 0,
                  price: Number(c.price) || 0,
                }))
              : [];

          if (composedItems.length > 0 && appointmentResult?.id) {
            try {
              const compositeGroupId = (crypto as any).randomUUID
                ? (crypto as any).randomUUID()
                : appointmentResult.id;

              // Mark first appointment as composite head
              const firstPrice = composedItems[0]?.price;
              const firstSvcPrice = Number(selectedServiceData?.price ?? 0);
              const firstDiscount = firstPrice != null && firstPrice < firstSvcPrice
                ? Math.max(0, firstSvcPrice - firstPrice)
                : 0;
              await (supabase as any)
                .from('appointments')
                .update({
                  composite_group_id: compositeGroupId,
                  composite_sequence_order: 1,
                  ...(firstDiscount > 0 ? { discount_amount: firstDiscount } : {}),
                })
                .eq('id', appointmentResult.id);

              // Build subsequent appointments respecting interval, business hours and absences
              let cursorStart = new Date(startTime);
              const inserts: any[] = [];
              for (let i = 1; i < composedItems.length; i++) {
                const comp = composedItems[i];
                // Fetch component service for duration/price
                const compSvc = services.find((s) => s.id === comp.service_id);
                const durationMin = compSvc?.duration ?? 60;
                const basePrice = Number(compSvc?.price ?? 0);
                const discount = comp.price < basePrice ? Math.max(0, basePrice - comp.price) : 0;

                // Advance cursor by interval_days
                let nextStart = new Date(cursorStart);
                nextStart.setDate(nextStart.getDate() + Math.max(0, comp.interval_days || 0));

                // Skip forward until day is a work day and slot has no conflict
                let safety = 365;
                while (safety-- > 0) {
                  const dayOk = typeof isWorkDay === 'function' ? isWorkDay(nextStart) : true;
                  const candidateEnd = new Date(nextStart.getTime() + durationMin * 60_000);
                  const conflict = dayOk
                    ? getAvailabilityConflictReason(nextStart, candidateEnd, {
                        appointments: appointments as any,
                        absences: absences as any,
                        selectedProfessional,
                        selectedRoom,
                      })
                    : 'Fora do expediente';
                  if (!conflict) break;
                  nextStart.setDate(nextStart.getDate() + 1);
                }

                const nextEnd = new Date(nextStart.getTime() + durationMin * 60_000);
                inserts.push({
                  client_id: selectedClient,
                  service_id: comp.service_id,
                  professional_id: selectedProfessional || null,
                  room_id: selectedRoom || null,
                  start_time: nextStart.toISOString(),
                  end_time: nextEnd.toISOString(),
                  notes: notes || null,
                  status: 'scheduled',
                  payment_status: 'pending',
                  composite_group_id: compositeGroupId,
                  composite_sequence_order: i + 1,
                  ...(discount > 0 ? { discount_amount: discount } : {}),
                });
                cursorStart = nextStart;
              }

              if (inserts.length > 0) {
                const { error: insErr } = await (supabase as any)
                  .from('appointments')
                  .insert(inserts);
                if (insErr) {
                  toast.error('Kit: primeiro agendamento criado, mas falhou ao criar os seguintes: ' + insErr.message);
                } else {
                  toast.success(`Kit criado: ${inserts.length + 1} agendamentos na sequência.`);
                  queryClient.invalidateQueries({ queryKey: ['appointments'] });
                }
              }
            } catch (kitErr: any) {
              console.error('Composite kit error', kitErr);
              toast.error('Erro ao criar cadeia do kit: ' + (kitErr?.message ?? 'desconhecido'));
            }
          }
        }


      }

      // Persist per-(professional, service) commission override so it
      // syncs in real-time with caixa, comissões, financeiro e perfil do profissional.
      if (
        serviceType === 'service' &&
        selectedProfessional &&
        selectedService &&
        commissionOverride.enabled
      ) {
        try {
          await saveCommissionOverride(selectedProfessional, selectedService, commissionOverride);
          queryClient.invalidateQueries({ queryKey: ['professional_service_commissions_all'] });
          queryClient.invalidateQueries({ queryKey: ['professional_service_commission'] });
        } catch (err: any) {
          toast.error('Agendamento criado, mas comissão não foi salva: ' + err.message);
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
    setCommissionOverride(defaultCommissionOverride);
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
    setServicePreferredDayOfWeek(null);
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
                  {/* Client's frequent services - shown as quick suggestions */}
                  {selectedClient && clientFrequentServices.length > 0 && !serviceSearch && (
                    <div className="border-b border-amber-500/20">
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-amber-600 bg-amber-500/10 flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Serviços Frequentes
                      </div>
                      {clientFrequentServices.map(service => (
                        <div
                          key={`freq-${service.id}`}
                          className="px-2 py-1.5 hover:bg-amber-500/10 cursor-pointer border-b border-border/50 bg-amber-500/5"
                          onClick={() => {
                            setSelectedService(service.id);
                            setServiceSearch(service.name);
                            setServiceType('service');
                            setUsingPaidServiceId(null);
                            setShowServiceSuggestions(false);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-amber-700 truncate">{service.name}</span>
                            <Badge variant="outline" className="text-[10px] h-5 px-1 border-amber-300 text-amber-600 flex-shrink-0">
                              {service.bookingCount}x agendado
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDurationClock(service.duration)} • R$ {Number(service.price).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Client's paid services - shown first */}
                  {selectedClient && clientPaidServices.length > 0 && (
                    <div className="border-b border-green-500/20">
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-green-600 bg-green-500/10 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        Serviços Pagos do Cliente
                      </div>
                      {Object.values(
                        clientPaidServices
                          .filter(s => !serviceSearch || s.service?.name?.toLowerCase().includes(serviceSearch.toLowerCase()))
                          .reduce((acc: Record<string, { first: any; count: number; totalPaid: number }>, paidService: any) => {
                            const key = paidService.service?.id || paidService.service_id;
                            if (!acc[key]) {
                              acc[key] = { first: paidService, count: 0, totalPaid: 0 };
                            }
                            acc[key].count += 1;
                            acc[key].totalPaid += Number(paidService.amount_paid || 0);
                            return acc;
                          }, {})
                      ).map(({ first: paidService, count, totalPaid }) => (
                          <div
                            key={`client-svc-${paidService.id}`}
                            className="px-2 py-1.5 hover:bg-green-500/10 cursor-pointer border-b border-border/50 bg-green-500/5"
                            onClick={() => {
                              const actualServiceId = paidService.service?.id || paidService.service_id;
                              setSelectedService(actualServiceId);
                              setServiceSearch(paidService.service?.name || '');
                              setServiceType('service');
                              setUsingPaidServiceId(paidService.id);
                              setShowServiceSuggestions(false);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-green-700 truncate">{paidService.service?.name}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {count > 1 && (
                                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-green-500 text-green-700">
                                    {count}x disponíveis
                                  </Badge>
                                )}
                                <Badge className="text-[10px] h-5 px-1.5 bg-green-500 text-white">
                                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                  PAGO
                                </Badge>
                              </div>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDurationClock(paidService.service?.duration || 0)} • {count > 1 ? `Total pago: R$ ${totalPaid.toFixed(2)} (${count}x)` : `Valor pago: R$ ${Number(paidService.amount_paid).toFixed(2)}`}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Client's packages (paid and pending) */}
                  {selectedClient && visibleClientPackages.length > 0 && (
                    <div className="border-b border-primary/20">
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-primary bg-primary/10 flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Pacotes do Cliente
                      </div>
                      {visibleClientPackages
                        .map((pkg) => {
                          const summary = getPackageAvailabilitySummary(pkg);
                          const remaining = summary.schedulableSessions;
                          const sameNameCount = visibleClientPackages.filter(p => p.name === pkg.name).length;
                          const packageDate = pkg.created_at ? format(new Date(pkg.created_at), 'dd/MM/yy', { locale: ptBR }) : '';
                          const isPaid = pkg.payment_methods && pkg.payment_methods.length > 0;
                          
                          return (
                            <div
                              key={`client-pkg-${pkg.id}`}
                              className={cn(
                                "px-2 py-1.5 cursor-pointer border-b border-border/50",
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
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={cn("text-xs font-medium truncate", isPaid ? "text-green-700" : "text-primary")}>{pkg.name}</span>
                                  {sameNameCount > 1 && (
                                    <span className="text-[11px] text-muted-foreground flex-shrink-0">({packageDate})</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold gap-0.5 border border-border">
                                    <Package className="h-2.5 w-2.5" />
                                    Pacote
                                  </Badge>
                                  {pkg.package_type === 'sequential' && (
                                    <Badge className="h-5 px-1.5 text-[10px] font-bold gap-0.5 bg-primary text-primary-foreground border border-primary">
                                      <Repeat className="h-2.5 w-2.5" />
                                      Seq
                                    </Badge>
                                  )}
                                  {isPaid ? (
                                    <Badge className="h-5 px-1.5 text-[10px] bg-green-500 text-white">
                                      <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                      PAGO
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-amber-600 border-amber-300">
                                      PENDENTE
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Agendar: {remaining} • Sessões: {summary.existingSessionRecords}/{summary.totalSessions}
                                {summary.hasInconsistentCounter ? ' • contador antigo' : ''}
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
                        className="px-2 py-1.5 hover:bg-accent cursor-pointer border-b border-border/50"
                        onClick={() => {
                          setSelectedService(service.id);
                          setServiceSearch(service.name);
                          setServiceType('service');
                          setShowServiceSuggestions(false);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{service.name}</span>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] flex-shrink-0">Serviço</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDurationClock(service.duration)} • R$ {Number(service.price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  {/* Packages (templates) */}
                  {visibleCatalogPackages
                    .slice(0, 5)
                    .map(pkg => (
                      <div
                        key={pkg.id}
                        className="px-2 py-1.5 hover:bg-accent cursor-pointer border-b border-border/50"
                        onClick={() => {
                          setSelectedService(pkg.id);
                          setServiceSearch(pkg.name);
                          setServiceType('package');
                          setShowServiceSuggestions(false);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{pkg.name}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold gap-0.5 border border-border">
                              <Package className="h-2.5 w-2.5" />
                              Pacote
                            </Badge>
                            {pkg.package_type === 'sequential' && (
                              <Badge className="h-5 px-1.5 text-[10px] font-bold gap-0.5 bg-primary text-primary-foreground border border-primary">
                                <Repeat className="h-2.5 w-2.5" />
                                Seq
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {pkg.total_sessions} sessões • R$ {Number(pkg.total_price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  {services.filter(s => s.is_active && s.name.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0 &&
                   visibleCatalogPackages.length === 0 &&
                   (!selectedClient || visibleClientPackages.length === 0) && (
                    <div className="px-2 py-1.5 text-muted-foreground text-xs">Nenhum serviço ou pacote encontrado</div>
                   )}
                </div>
              )}
              {selectedServiceData && serviceType === 'service' && (
                <div className="mt-2 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Duração: {formatDurationClock(selectedServiceData.duration)} • 
                    Valor: R$ {Number(selectedServiceData.price).toFixed(2)}
                    {selectedServiceData.return_days && ` • Retorno: ${selectedServiceData.return_days} dias`}
                  </p>

                  {/* Composite service kit preview */}
                  {Array.isArray((selectedServiceData as any)?.service_components) && (selectedServiceData as any).service_components.length > 0 && (() => {
                    const comps = (selectedServiceData as any).service_components as Array<{ service_id: string; interval_days: number; price: number }>;
                    let cumulativeDays = 0;
                    const total = comps.reduce((s, c) => s + Number(c.price || 0), 0);
                    return (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                            <Repeat className="h-3.5 w-3.5" />
                            Kit de serviços ({comps.length} etapas)
                          </Label>
                          <span className="text-[11px] text-muted-foreground">
                            Total: R$ {total.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Será criado um agendamento para cada etapa, respeitando o intervalo. Cobrança separada por etapa.
                        </p>
                        <div className="space-y-1">
                          {comps.map((c, i) => {
                            cumulativeDays += Number(c.interval_days || 0);
                            const compSvc = services.find(s => s.id === c.service_id);
                            return (
                              <div key={`kit-prev-${i}`} className="flex items-center gap-2 text-xs bg-background rounded border p-1.5">
                                <Badge variant="secondary" className="text-[10px] h-5">{i + 1}</Badge>
                                <span className="flex-1 truncate font-medium">{compSvc?.name ?? 'Serviço removido'}</span>
                                <span className="text-muted-foreground text-[11px]">
                                  {i === 0 ? 'Início' : `+${c.interval_days}d (dia ${cumulativeDays})`}
                                </span>
                                <span className="font-semibold">R$ {Number(c.price || 0).toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}



                  {/* Discount on scheduling — only when not using a prepaid service */}
                  {!usingPaidServiceId && (
                    <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
                      <Label className="text-xs font-medium">Desconto neste agendamento (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 text-xs"
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0,00"
                      />
                      {discountValue > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Valor com desconto: R$ {Math.max(0, Number(selectedServiceData.price) - discountValue).toFixed(2)}
                        </p>
                      )}
                      {discountValue > 0 && repeatServiceEnabled && editableServiceDates.length > 1 && (
                        <div className="flex items-center justify-between pt-1 border-t">
                          <Label className="text-[11px] text-muted-foreground">
                            Aplicar desconto em todos os {editableServiceDates.length} agendamentos
                          </Label>
                          <Switch
                            checked={discountApplyToAll}
                            onCheckedChange={setDiscountApplyToAll}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  

                  
                  {/* Recurring service options - only if not using a paid service */}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <div className="space-y-2">
                <Label className="text-sky-700 dark:text-sky-300 font-medium">Data *</Label>
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
                        // Permite selecionar datas retroativas — apenas restringe dias em que a clínica não atende
                        if (!isWorkDay(date)) return true;
                        return false;
                      }}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-sky-700 dark:text-sky-300">Início *</Label>
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="pl-8 h-9"
                        placeholder="HH:MM"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" type="button" className="shrink-0 h-9 w-9">
                          <CalendarIcon className="h-3.5 w-3.5" />
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-sky-700 dark:text-sky-300 flex items-center justify-between">
                    <span>Término</span>
                    {endTimeOverride && (
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => setEndTimeOverride('')}
                        title="Restaurar término automático"
                      >
                        Auto
                      </button>
                    )}
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="time"
                      value={endTimeOverride || (appointmentTimes?.endLabel || '')}
                      onChange={(e) => setEndTimeOverride(e.target.value)}
                      className="pl-8 h-9"
                      placeholder="HH:MM"
                      disabled={!appointmentTimes}
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                O término é calculado pela duração do serviço, mas pode ser editado manualmente.
              </p>
            </div>

                  {selectedServiceData && serviceType === 'service' && selectedClient && (!usingPaidServiceId || paidSiblingCount > 1) && (
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
                          {usingPaidServiceId && paidSiblingCount > 1 && (
                            <div className="text-[11px] rounded-md bg-green-500/10 border border-green-500/30 text-green-700 px-2 py-1.5">
                              Este cliente possui <strong>{paidSiblingCount} aplicações pagas</strong> deste serviço. Cada agendamento criado consumirá uma aplicação.
                            </div>
                          )}
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
                                  {(usingPaidServiceId
                                    ? Array.from({ length: Math.max(1, paidSiblingCount - 1) }, (_, i) => i + 2)
                                    : [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20]
                                  ).map(num => (
                                    <SelectItem key={num} value={num.toString()}>
                                      {num} agendamentos
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Intervalo (dias)</Label>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                className="h-8 text-xs"
                                value={serviceIntervalDays}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v) && v >= 1 && v <= 365) setServiceIntervalDays(v);
                                  else if (e.target.value === '') setServiceIntervalDays(1);
                                }}
                                placeholder="Ex.: 7, 14, 21..."
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Dia da semana preferido</Label>
                            <Select
                              value={servicePreferredDayOfWeek === null ? '_any' : servicePreferredDayOfWeek.toString()}
                              onValueChange={(v) => setServicePreferredDayOfWeek(v === '_any' ? null : parseInt(v))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_any">Qualquer dia útil</SelectItem>
                                <SelectItem value="1">Segunda-feira</SelectItem>
                                <SelectItem value="2">Terça-feira</SelectItem>
                                <SelectItem value="3">Quarta-feira</SelectItem>
                                <SelectItem value="4">Quinta-feira</SelectItem>
                                <SelectItem value="5">Sexta-feira</SelectItem>
                                <SelectItem value="6">Sábado</SelectItem>
                                <SelectItem value="0">Domingo</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                              Quando definido, as repetições caem sempre neste dia da semana.
                            </p>
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
                              <div className="flex flex-col">
                                <span className="text-xs font-medium">Enviar todos por WhatsApp</span>
                                <span className="text-[10px] text-muted-foreground">
                                  O cliente receberá uma mensagem com a lista completa dos {editableServiceDates.length || repeatCount} agendamentos.
                                </span>
                              </div>
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
                                      <Popover open={editingServiceDateIndex === index} onOpenChange={(o) => setEditingServiceDateIndex(o ? index : null)}>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className={cn(
                                              "flex-1 text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors flex items-center justify-between",
                                              index === 0 ? "font-medium" : "text-muted-foreground",
                                              hasConflict && "text-destructive"
                                            )}
                                          >
                                            <span className="truncate">
                                              {selectedServiceData?.name ? <span className="font-medium">{selectedServiceData.name} · </span> : null}
                                              {format(previewDate, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                                            </span>
                                            <Pencil className="h-3 w-3 opacity-50 shrink-0 ml-1" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2 z-50" align="start">
                                          <Calendar
                                            mode="single"
                                            selected={previewDate}
                                            defaultMonth={previewDate}
                                            onSelect={(d) => {
                                              if (!d) return;
                                              const next = new Date(d);
                                              next.setHours(previewDate.getHours(), previewDate.getMinutes(), 0, 0);
                                              updateEditableServiceDate(index, next);
                                            }}
                                            disabled={(d) => !isWorkDay(d)}
                                            locale={ptBR}
                                            initialFocus
                                            className="pointer-events-auto"
                                          />
                                          <div className="mt-2 flex items-center gap-2 border-t pt-2">
                                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                            <Input
                                              type="time"
                                              className="h-7 text-xs"
                                              value={format(previewDate, 'HH:mm')}
                                              onChange={(e) => {
                                                const [h, m] = e.target.value.split(':').map(Number);
                                                if (isNaN(h) || isNaN(m)) return;
                                                const next = new Date(previewDate);
                                                next.setHours(h, m, 0, 0);
                                                updateEditableServiceDate(index, next);
                                              }}
                                            />
                                            <span className="text-[11px] text-muted-foreground">
                                              {format(previewDate, "EEEE", { locale: ptBR })}
                                            </span>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
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
                        </div>
                      )}
                    </div>
                  )}

              {selectedPackageData && serviceType === 'package' && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Duração: {formatDurationClock(selectedPackageData.duration || 60)} • 
                    {selectedPackageData.total_sessions} sessões • 
                    Valor: R$ {Number(selectedPackageData.total_price).toFixed(2)}
                  </p>
                  {selectedPackageData?.package_type === 'sequential' && nextPackageStepService && (
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px]">Próxima aplicação</Badge>
                      <span className="font-medium">{nextPackageStepService.name}</span>
                      <span className="text-muted-foreground">· {selectedPackageData.name}</span>
                    </div>
                  )}
                  
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
                              <Label className="text-xs">Dia da semana preferido</Label>
                              <Select
                                value={preferredDayOfWeek !== null ? preferredDayOfWeek.toString() : '_any'}
                                onValueChange={(v) => setPreferredDayOfWeek(v === '_any' ? null : parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Qualquer dia útil" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_any">Qualquer dia útil</SelectItem>
                                  <SelectItem value="1">Segunda-feira</SelectItem>
                                  <SelectItem value="2">Terça-feira</SelectItem>
                                  <SelectItem value="3">Quarta-feira</SelectItem>
                                  <SelectItem value="4">Quinta-feira</SelectItem>
                                  <SelectItem value="5">Sexta-feira</SelectItem>
                                  {workSaturdays && <SelectItem value="6">Sábado</SelectItem>}
                                  {workSundays && <SelectItem value="0">Domingo</SelectItem>}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Horário preferido</Label>
                              <Input
                                type="time"
                                className="h-8 text-xs"
                                value={preferredTime}
                                onChange={(e) => setPreferredTime(e.target.value)}
                                placeholder="Mesmo horário"
                              />
                              {!preferredTime && (
                                <p className="text-[10px] text-muted-foreground">Vazio = mesmo horário</p>
                              )}
                            </div>
                          </div>
                          {packageSequenceSteps.length > 0 ? (
                            <Alert className="py-2">
                              <Info className="h-3 w-3" />
                              <AlertDescription className="text-xs">
                                Os intervalos entre etapas seguem o cadastro do pacote sequencial.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs whitespace-nowrap">Intervalo (dias):</Label>
                              <Input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                className="h-8 w-16 text-xs text-center tabular-nums"
                                placeholder={String(existingClientPackage?.interval_days || selectedPackageData?.interval_days || 7)}
                                value={customIntervalDays}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                                  setCustomIntervalDays(v);
                                }}
                              />
                              <span className="text-xs text-muted-foreground">
                                {customIntervalDays
                                  ? `a cada ${customIntervalDays} dia${Number(customIntervalDays) === 1 ? '' : 's'}`
                                  : `padrão: a cada ${existingClientPackage?.interval_days || selectedPackageData?.interval_days || 7} dias`}
                              </span>
                            </div>
                          )}

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
                                            <Popover open onOpenChange={(o) => { if (!o) setEditingDateIndex(null); }}>
                                              <PopoverTrigger asChild>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 flex-1 justify-start text-xs font-normal"
                                                >
                                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                                  {format(previewDate, "EEE, dd/MM/yyyy", { locale: ptBR })}
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                  mode="single"
                                                  selected={previewDate}
                                                  defaultMonth={previewDate}
                                                  onSelect={(d) => {
                                                    if (!d) return;
                                                    const merged = new Date(d);
                                                    merged.setHours(previewDate.getHours(), previewDate.getMinutes(), 0, 0);
                                                    updateEditableDate(index, merged);
                                                  }}
                                                  locale={ptBR}
                                                  initialFocus
                                                  className="p-3 pointer-events-auto"
                                                />
                                              </PopoverContent>
                                            </Popover>
                                            <Input
                                              type="time"
                                              className="h-7 text-xs w-24"
                                              value={format(previewDate, 'HH:mm')}
                                              onChange={(e) => {
                                                const [hh, mm] = e.target.value.split(':').map(Number);
                                                if (isNaN(hh) || isNaN(mm)) return;
                                                const merged = new Date(previewDate);
                                                merged.setHours(hh, mm, 0, 0);
                                                updateEditableDate(index, merged);
                                              }}
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-xs"
                                              onClick={() => setEditingDateIndex(null)}
                                            >
                                              OK
                                            </Button>
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
                                            <span className="truncate" data-testid={`preview-session-label-${index}`}>
                                              {(() => {
                                                // Pacote comum: todos os serviços têm o mesmo nome,
                                                // então não exibimos o nome do serviço na visualização.
                                                if (selectedPackageData?.package_type !== 'sequential') {
                                                  return null;
                                                }
                                                const name = resolveSessionServiceLabel({
                                                  index,
                                                  steps: packageSequenceSteps as any,
                                                  services: services as any,
                                                  pkg: selectedPackageData as any,
                                                  nextStepService: nextPackageStepService as any,
                                                  fallbackService: selectedServiceData as any,
                                                });
                                                return name ? <span className="font-medium">{name} · </span> : null;
                                              })()}
                                              {format(previewDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                                            </span>
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

            <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
              <Label className="text-violet-700 dark:text-violet-300 font-medium">Profissional *</Label>
              <SearchableSelect
                options={activeProfessionals.map(p => ({
                  value: p.id,
                  label: p.name,
                  color: p.agenda_color || undefined,
                }))}
                value={selectedProfessional}
                onChange={setSelectedProfessional}
                placeholder="Selecione um profissional"
                searchPlaceholder="Buscar profissional..."
                emptyMessage="Nenhum profissional encontrado"
              />
            </div>

            {/* Per-service commission for selected professional (auto-loads existing override, editable) */}
            {selectedProfessional && serviceType === 'service' && selectedService && (
              <ProfessionalCommissionField
                professionalId={selectedProfessional}
                serviceId={selectedService}
                value={commissionOverride}
                onChange={setCommissionOverride}
              />
            )}

            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <Label className="text-amber-700 dark:text-amber-300 font-medium">
                Sala{activeRooms.length > 1 ? ' *' : ''}
              </Label>
              <SearchableSelect
                options={activeRooms.map(r => ({
                  value: r.id,
                  label: r.name,
                }))}
                value={selectedRoom}
                onChange={setSelectedRoom}
                placeholder={activeRooms.length > 1 ? 'Selecione uma sala' : 'Selecione uma sala (opcional)'}
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


            {/* Show appointment summary */}
            {date && time && appointmentTimes && (selectedServiceData || selectedPackageData) && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium mb-1">Resumo do Agendamento</p>
                <p className="text-xs text-muted-foreground">
                  {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })} • Início {time} • Término {appointmentTimes.endLabel || addMinutesToClock(time, (serviceType === 'service' ? (selectedServiceData?.duration || 60) : (selectedPackageData?.package_type === 'sequential' ? ((nextPackageStepService as any)?.duration || 60) : (selectedPackageData?.duration || 60))))}
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

            {/* Conflict warnings removidos: a checagem inline nos previews já indica conflitos sem mensagem confusa global */}

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
                disabled={!selectedClient || !selectedService || !date || !time || !selectedProfessional || (activeRooms.length > 1 && !selectedRoom) || hasPreviewConflicts || hasServicePreviewConflicts || !!businessHoursError || createAppointment.isPending || createRecurringAppointments.isPending}
              >
                {(createAppointment.isPending || createRecurringAppointments.isPending) ? 'Salvando...' : (hasPreviewConflicts || hasServicePreviewConflicts) ? 'Resolva os conflitos' : repeatServiceEnabled ? `Criar ${editableServiceDates.length} Agendamentos` : 'Criar Agendamento'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>

    <WhatsappPreviewDialog
      open={whatsappPreviewOpen}
      onOpenChange={setWhatsappPreviewOpen}
      phone={whatsappPreviewPhone}
      initialMessage={whatsappPreviewMessage}
      title="Enviar confirmação no WhatsApp"
      description="Revise e edite a mensagem antes de enviar para o cliente."
    />



    <AlertDialog open={showHolidayConfirm} onOpenChange={setShowHolidayConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {selectedHoliday?.type === 'commemorative' ? 'Data comemorativa' : 'Feriado nacional'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            A data selecionada é {selectedHoliday?.type === 'commemorative' ? 'uma data comemorativa' : 'um feriado'}: <strong>{selectedHoliday?.name}</strong>. Deseja realmente agendar nesta data?
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
