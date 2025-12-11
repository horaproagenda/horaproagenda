import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

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
  const [date, setDate] = useState<Date | undefined>(prefilledDate);
  const [time, setTime] = useState(prefilledTime || '');
  const [notes, setNotes] = useState('');

  const { clients } = useClients();
  const { services } = useServices();
  const { professionals } = useProfessionals();
  const { createAppointment } = useAppointments();
  const { generateTimeSlots } = useBusinessSettings();

  const timeSlots = generateTimeSlots();
  const selectedServiceData = services.find(s => s.id === selectedService);
  const activeProfessionals = professionals.filter(p => p.is_active);
  const activeClients = clients.filter(c => c.is_active);

  // Update date/time when prefilled values change
  useEffect(() => {
    if (prefilledDate) setDate(prefilledDate);
    if (prefilledTime) setTime(prefilledTime);
  }, [prefilledDate, prefilledTime]);

  // Auto-select professional from service if available
  useEffect(() => {
    if (selectedServiceData?.professional_id) {
      setSelectedProfessional(selectedServiceData.professional_id);
    }
  }, [selectedServiceData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedClient || !selectedService || !date || !time || !selectedServiceData) {
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
    setDate(undefined);
    setTime('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Novo Agendamento</DialogTitle>
          <DialogDescription>
            Preencha as informações para criar um novo agendamento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="client">Cliente *</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectContent>
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
              <SelectContent>
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
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
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
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
              disabled={!selectedClient || !selectedService || !date || !time || createAppointment.isPending}
            >
              {createAppointment.isPending ? 'Salvando...' : 'Criar Agendamento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
