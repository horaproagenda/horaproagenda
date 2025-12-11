import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, Users, Calendar, RotateCcw, Home, User, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Service } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryColor } from '@/lib/categoryColors';

interface ServiceDetailDialogProps {
  service: Service;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceDetailDialog({ service, open, onOpenChange }: ServiceDetailDialogProps) {
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [clientsCount, setClientsCount] = useState(0);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchServiceStats();
    }
  }, [open, service.id]);

  const fetchServiceStats = async () => {
    setIsLoading(true);
    try {
      // Count appointments using this service
      const { count: apptCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', service.id);

      // Count unique clients using this service
      const { data: appointments } = await supabase
        .from('appointments')
        .select('client_id')
        .eq('service_id', service.id);

      const uniqueClients = new Set(appointments?.map(a => a.client_id) || []);

      // Get room name if exists
      if (service.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', service.room_id)
          .single();
        setRoomName(room?.name || null);
      }

      // Get professional name if exists
      if (service.professional_id) {
        const { data: professional } = await supabase
          .from('professionals')
          .select('name')
          .eq('id', service.professional_id)
          .single();
        setProfessionalName(professional?.name || null);
      }

      setAppointmentsCount(apptCount || 0);
      setClientsCount(uniqueClients.size);
    } catch (error) {
      console.error('Error fetching service stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const categoryColor = getCategoryColor(service.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">{service.name}</DialogTitle>
              <Badge 
                variant="outline" 
                className="mt-2"
                style={{ backgroundColor: `${categoryColor.hex}15`, borderColor: `${categoryColor.hex}40` }}
              >
                {service.category}
              </Badge>
            </div>
            <Badge variant={service.is_active ? 'default' : 'secondary'}>
              {service.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </DialogHeader>

        {service.description && (
          <p className="text-muted-foreground">{service.description}</p>
        )}

        <Separator />

        {/* Usage Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-primary/10 p-4 text-center">
            <Users className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-2xl font-bold">{isLoading ? '...' : clientsCount}</p>
            <p className="text-xs text-muted-foreground">Clientes usando</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-4 text-center">
            <Calendar className="mx-auto h-6 w-6 text-secondary-foreground" />
            <p className="mt-2 text-2xl font-bold">{isLoading ? '...' : appointmentsCount}</p>
            <p className="text-xs text-muted-foreground">Agendamentos</p>
          </div>
        </div>

        <Separator />

        {/* Service Details */}
        <div className="space-y-3">
          <h4 className="font-semibold">Detalhes do Serviço</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <DollarSign className="h-5 w-5 text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="font-semibold">R$ {Number(service.price).toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Duração</p>
                <p className="font-semibold">{service.duration} min</p>
              </div>
            </div>

            {service.return_days && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <RotateCcw className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Retorno</p>
                  <p className="font-semibold">{service.return_days} dias</p>
                </div>
              </div>
            )}

            {roomName && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <Home className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Sala</p>
                  <p className="font-semibold">{roomName}</p>
                </div>
              </div>
            )}

            {professionalName && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 col-span-2">
                <User className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Profissional</p>
                  <p className="font-semibold">{professionalName}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
