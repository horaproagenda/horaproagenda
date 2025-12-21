import { useState, useEffect, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, AlertTriangle, CheckCircle, UserX, Package, Info, Briefcase } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientServices } from '@/hooks/useClientServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { Appointment } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [clientSearch, setClientSearch] = useState('');
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showServiceSuggestions, setShowServiceSuggestions] = useState(false);
  
  // Auto-schedule settings for packages
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
  const [preferredDayOfWeek, setPreferredDayOfWeek] = useState<number | null>(null);
  const [preferredTime, setPreferredTime] = useState('');

  const { clients } = useClients();
  const { services } = useServices();
  const { packages } = useServicePackages();
  const { clientPackages, findClientPackageByTemplate, createClientPackage, incrementPackageSession } = useClientPackages(selectedClient || null);
  const { availableServices: clientPaidServices, markServiceAsUsed } = useClientServices(selectedClient || null);
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();
  const { appointments, createAppointment } = useAppointments();
  const { settings, generateTimeSlots } = useBusinessSettings();
  const { absences } = useProfessionalAbsences();

  const timeSlots = generateTimeSlots();

  // State to track if using a paid service
  const [usingPaidServiceId, setUsingPaidServiceId] = useState<string | null>(null);

  // Check if a date is a valid work day
  const isWorkDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 && !settings?.work_sundays) return false; // Sunday
    if (dayOfWeek === 6 && !settings?.work_saturdays) return false; // Saturday
    return true;
  };
  const selectedServiceData = services.find(s => s.id === selectedService);
  // Look for package in both templates and client packages (paid packages)
  const selectedPackageData = packages.find(p => p.id === selectedService) 
    || clientPackages.find(p => p.id === selectedService);
  const currentDuration = serviceType === 'service' 
    ? (selectedServiceData?.duration || manualDuration) 
    : (selectedPackageData?.duration || manualDuration);
  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeClients = clients.filter(c => c.is_active);
  const activeRooms = rooms.filter(r => r.is_active);
  const activeEquipment = equipment.filter(e => e.is_active);
  const activePackages = packages.filter(p => p.is_active && !p.client_id);

  // Check if selected package is already a client package (paid)
  const isClientPackageSelected = clientPackages.some(p => p.id === selectedService);
  
  // Check if client already has this package (by template)
  const existingClientPackage = serviceType === 'package' && selectedService && selectedClient
    ? (isClientPackageSelected 
        ? clientPackages.find(p => p.id === selectedService)
        : findClientPackageByTemplate(selectedService))
    : null;

  const packageRemainingSessions = existingClientPackage
    ? existingClientPackage.total_sessions - existingClientPackage.sessions_scheduled
    : selectedPackageData?.total_sessions || 0;

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
      setServiceType('service');
      setServiceSearch('');
      setClientSearch('');
    }
  }, [open, prefilledDate, prefilledTime]);

  // Reset paid service when client changes
  useEffect(() => {
    setUsingPaidServiceId(null);
    setSelectedService('');
    setServiceSearch('');
    setServiceType('service');
  }, [selectedClient]);

  // Debug log for client packages
  useEffect(() => {
    if (selectedClient && clientPackages.length > 0) {
      console.log('Client packages available for scheduling:', clientPackages.map(p => ({
        id: p.id,
        name: p.name,
        remaining: p.total_sessions - p.sessions_scheduled
      })));
    }
  }, [selectedClient, clientPackages]);
  useEffect(() => {
    if (selectedServiceData?.professional_id) {
      setSelectedProfessional(selectedServiceData.professional_id);
    }
    if (selectedServiceData?.room_id) {
      setSelectedRoom(selectedServiceData.room_id);
    }
  }, [selectedServiceData]);

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

  // Check for conflicts
  const conflicts = useMemo<ConflictInfo[]>(() => {
    if (!appointmentTimes) return [];
    
    const { startTime, endTime } = appointmentTimes;
    const foundConflicts: ConflictInfo[] = [];

    // Check for professional absence
    if (selectedProfessional) {
      absences.forEach(absence => {
        const absenceStart = new Date(absence.start_time);
        const absenceEnd = new Date(absence.end_time);
        
        const overlaps = startTime < absenceEnd && endTime > absenceStart;
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
      const overlaps = startTime < aptEnd && endTime > aptStart;
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
  }, [appointmentTimes, appointments, absences, selectedProfessional, selectedRoom, professionals, rooms]);

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
    
    // For regular services, we need a service_id
    if (!isPackageAppointment && !selectedService) {
      return;
    }

    // Block if there are conflicts
    if (conflicts.length > 0) {
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
        const packageServiceId = selectedPackageData?.service_id || null;
        const appointmentResult = await createAppointment.mutateAsync({
          client_id: selectedClient,
          service_id: packageServiceId,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          notes: `${selectedPackageData.name}${notes ? ' - ' + notes : ''}`,
          professional_id: selectedProfessional || selectedPackageData.professional_id || undefined,
          room_id: selectedRoom || selectedPackageData.room_id || undefined,
          payment_status: existingClientPackage ? 'paid' : 'pending',
        });

        // Link the appointment to the package session
        if (clientPackageId) {
          await incrementPackageSession.mutateAsync({
            packageId: clientPackageId,
            appointmentId: appointmentResult.id,
          });
        }

        // If auto-schedule is enabled and it's the first appointment, create future appointments
        if (autoScheduleEnabled && !existingClientPackage && selectedPackageData.total_sessions > 1) {
          const intervalDays = selectedPackageData.interval_days || 7;
          const sessionsToCreate = selectedPackageData.total_sessions - 1;

          for (let i = 1; i <= sessionsToCreate; i++) {
            const futureDate = addDays(startTime, intervalDays * i);
            
            // Adjust to preferred day of week if set
            if (preferredDayOfWeek !== null) {
              while (futureDate.getDay() !== preferredDayOfWeek) {
                futureDate.setDate(futureDate.getDate() + 1);
              }
            }

            const futureEnd = new Date(futureDate);
            futureEnd.setMinutes(futureEnd.getMinutes() + duration);

            const futureAppointment = await createAppointment.mutateAsync({
              client_id: selectedClient,
              service_id: packageServiceId,
              start_time: futureDate.toISOString(),
              end_time: futureEnd.toISOString(),
              notes: `${selectedPackageData.name} - Sessão ${i + 1} de ${selectedPackageData.total_sessions}`,
              professional_id: selectedProfessional || selectedPackageData.professional_id || undefined,
              room_id: selectedRoom || selectedPackageData.room_id || undefined,
              payment_status: 'paid',
            });

            if (clientPackageId) {
              await incrementPackageSession.mutateAsync({
                packageId: clientPackageId,
                appointmentId: futureAppointment.id,
              });
            }
          }

          toast.success(`${sessionsToCreate + 1} agendamentos criados automaticamente!`);
        }
      } else {
        // Regular service appointment
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

      onOpenChange(false);
      resetForm();
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
    setServiceType('service');
    setServiceSearch('');
    setClientSearch('');
    setUsingPaidServiceId(null);
  };

  const hasConflicts = conflicts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle className="font-display text-xl">Novo Agendamento</DialogTitle>
          <DialogDescription>
            Preencha as informações para criar um novo agendamento
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  if (!e.target.value) {
                    setSelectedService('');
                    setServiceType('service');
                  }
                }}
                onFocus={() => setShowServiceSuggestions(true)}
              />
              {showServiceSuggestions && (serviceSearch || selectedClient) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[350px] overflow-y-auto">
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

                  {/* Client's paid packages */}
                  {selectedClient && clientPackages.length > 0 && (
                    <div className="border-b-2 border-primary/20">
                      <div className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Pacotes Pagos do Cliente
                      </div>
                      {clientPackages
                        .filter(p => !serviceSearch || p.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                        .map(pkg => {
                          const remaining = pkg.total_sessions - pkg.sessions_scheduled;
                          return (
                            <div
                              key={`client-pkg-${pkg.id}`}
                              className="p-2 hover:bg-primary/5 cursor-pointer border-b bg-primary/5"
                              onClick={() => {
                                setSelectedService(pkg.id);
                                setServiceSearch(pkg.name);
                                setServiceType('package');
                                setUsingPaidServiceId(null);
                                setShowServiceSuggestions(false);
                              }}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-primary">{pkg.name}</span>
                                <Badge className="text-xs bg-green-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  PAGO
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {remaining} de {pkg.total_sessions} sessões disponíveis
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
                  {activePackages
                    .filter(p => p.name.toLowerCase().includes(serviceSearch.toLowerCase()))
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
                   activePackages.filter(p => p.name.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0 &&
                   (!selectedClient || clientPackages.filter(p => !serviceSearch || p.name.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0) && (
                    <div className="p-2 text-muted-foreground text-sm">Nenhum serviço ou pacote encontrado</div>
                   )}
                </div>
              )}
              {selectedServiceData && (
                <p className="text-xs text-muted-foreground mt-2">
                  Duração: {selectedServiceData.duration} minutos • 
                  Valor: R$ {Number(selectedServiceData.price).toFixed(2)}
                </p>
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
                      <AlertDescription className="text-sm">
                        <span className="font-medium">
                          {packageRemainingSessions} sessão(ões) restante(s)
                        </span> de {existingClientPackage.total_sessions} neste pacote
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Show auto-schedule options for new package */}
                  {!existingClientPackage && selectedClient && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Agendamento Automático</Label>
                          <p className="text-xs text-muted-foreground">
                            Agendar todas as {selectedPackageData.total_sessions} sessões automaticamente
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
                            Intervalo: a cada {selectedPackageData.interval_days || 7} dias
                          </p>
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
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Horário">
                      {time && (
                        <span className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {time}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {availableSlots.map(({ slot, isAvailable, conflictReason }) => (
                      <SelectItem 
                        key={slot} 
                        value={slot}
                        className={cn(!isAvailable && 'opacity-50')}
                      >
                        <div className="flex items-center gap-2">
                          {isAvailable ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                          <span>{slot}</span>
                          {!isAvailable && (
                            <span className="text-xs text-destructive">({conflictReason})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                disabled={!selectedClient || !selectedService || !date || !time || hasConflicts || createAppointment.isPending}
              >
                {createAppointment.isPending ? 'Salvando...' : 'Criar Agendamento'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
