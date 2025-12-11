import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, Users, Calendar, Home, User, Package, Layers, Timer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type ServicePackage = Tables<'service_packages'>;

interface PackageDetailDialogProps {
  pkg: ServicePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackageDetailDialog({ pkg, open, onOpenChange }: PackageDetailDialogProps) {
  const [clientsCount, setClientsCount] = useState(0);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [equipmentNames, setEquipmentNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchPackageStats();
    }
  }, [open, pkg.id]);

  const fetchPackageStats = async () => {
    setIsLoading(true);
    try {
      // Count packages with same name (templates in use)
      const { count } = await supabase
        .from('service_packages')
        .select('*', { count: 'exact', head: true })
        .eq('name', pkg.name)
        .not('client_id', 'is', null);

      setClientsCount(count || 0);

      // Get room name if exists
      if (pkg.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', pkg.room_id)
          .single();
        setRoomName(room?.name || null);
      }

      // Get professional name if exists
      if (pkg.professional_id) {
        const { data: professional } = await supabase
          .from('professionals')
          .select('name')
          .eq('id', pkg.professional_id)
          .single();
        setProfessionalName(professional?.name || null);
      }

      // Get client name if exists
      if (pkg.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('name')
          .eq('id', pkg.client_id)
          .single();
        setClientName(client?.name || null);
      }

      // Get equipment names if exists
      if (pkg.equipment && pkg.equipment.length > 0) {
        const { data: equipmentData } = await supabase
          .from('equipment')
          .select('name')
          .in('id', pkg.equipment);
        setEquipmentNames(equipmentData?.map(e => e.name) || []);
      }
    } catch (error) {
      console.error('Error fetching package stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-xl">{pkg.name}</DialogTitle>
            </div>
            <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
              {pkg.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </DialogHeader>

        {pkg.description && (
          <p className="text-muted-foreground">{pkg.description}</p>
        )}

        <Separator />

        {/* Usage Stats */}
        <div className="rounded-lg bg-primary/10 p-4 text-center">
          <Users className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-2 text-2xl font-bold">{isLoading ? '...' : clientsCount}</p>
          <p className="text-xs text-muted-foreground">Clientes usando este pacote</p>
        </div>

        <Separator />

        {/* Package Details */}
        <div className="space-y-3">
          <h4 className="font-semibold">Detalhes do Pacote</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <DollarSign className="h-5 w-5 text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="font-semibold">R$ {Number(pkg.total_price).toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Layers className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total de Sessões</p>
                <p className="font-semibold">{pkg.total_sessions}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Duração/Sessão</p>
                <p className="font-semibold">{pkg.duration || 60} min</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Timer className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Intervalo</p>
                <p className="font-semibold">{pkg.interval_days || 7} dias</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Agendamento</p>
                <p className="font-semibold">{pkg.auto_schedule ? 'Automático' : 'Manual'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <Calendar className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Sessões Agendadas</p>
                <p className="font-semibold">{pkg.sessions_scheduled} / {pkg.total_sessions}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        {(roomName || professionalName || clientName || equipmentNames.length > 0) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-semibold">Informações Adicionais</h4>
              
              <div className="space-y-2">
                {clientName && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <User className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="font-semibold">{clientName}</p>
                    </div>
                  </div>
                )}

                {professionalName && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <User className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Profissional</p>
                      <p className="font-semibold">{professionalName}</p>
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

                {equipmentNames.length > 0 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-2">Equipamentos</p>
                    <div className="flex flex-wrap gap-1">
                      {equipmentNames.map((name, idx) => (
                        <Badge key={idx} variant="outline">{name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* WhatsApp Reminder */}
        <div className="rounded-lg border p-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Lembrete WhatsApp:</span>{' '}
            <Badge variant={pkg.whatsapp_reminder ? 'default' : 'secondary'}>
              {pkg.whatsapp_reminder ? 'Ativado' : 'Desativado'}
            </Badge>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
