import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, AlertTriangle, CheckCircle, UserX } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { Appointment } from '@/types';

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
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  const { clients } = useClients();
  const { services } = useServices();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { appointments, createAppointment } = useAppointments();
  const { settings, generateTimeSlots } = useBusinessSettings();
  const { absences } = useProfessionalAbsences();

  const timeSlots = generateTimeSlots();

  // Check if a date is a valid work day
  const isWorkDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 && !settings?.work_sundays) return false; // Sunday
    if (dayOfWeek === 6 && !settings?.work_saturdays) return false; // Saturday
    return true;
  };
  const selectedServiceData = services.find(s => s.id === selectedService);
  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeClients = clients.filter(c => c.is_active);
  const activeRooms = rooms.filter(r => r.is_active);

  // Reset form and apply prefilled values when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedClient('');
      setSelectedService('');
      setSelectedProfessional('');
      setSelectedRoom('');
      setNotes('');
      setDate(prefilledDate || undefined);
      setTime(prefilledTime || '');
    }
  }, [open, prefilledDate, prefilledTime]);

  // Auto-select professional and room from service if available
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
    if (!date || !time || !selectedServiceData) return null;
    
    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + selectedServiceData.duration);

    return { startTime, endTime };
  }, [date, time, selectedServiceData]);

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
    
    if (!selectedClient || !selectedService || !date || !time || !selectedServiceData) {
      return;
    }

    // Block if there are conflicts
    if (conflicts.length > 0) {
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + selectedServiceData.duration);

    await createAppointment.mutateAsync({
      client_id: selectedClient,
      service_id: selectedService,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: notes || undefined,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedClient('');
    setSelectedService('');
    setSelectedProfessional('');
    setSelectedRoom('');
    setDate(undefined);
    setTime('');
    setNotes('');
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
            <div className="space-y-2">
              <Label htmlFor="client">Cliente *</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {activeClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      <div className="flex flex-col">
                        <span>{client.name}</span>
                        <span className="text-xs text-muted-foreground">{client.phone}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service">Serviço *</Label>
              <Select value={selectedService} onValueChange={setSelectedService}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {services.filter(s => s.is_active).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{service.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {service.duration}min • R$ {service.price}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedServiceData && (
                <p className="text-xs text-muted-foreground">
                  Duração: {selectedServiceData.duration} minutos • 
                  Valor: R$ {Number(selectedServiceData.price).toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um profissional (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
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

            <div className="space-y-2">
              <Label>Sala</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma sala (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {activeRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
