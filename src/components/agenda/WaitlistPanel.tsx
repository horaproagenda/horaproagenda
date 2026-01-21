import React, { useState } from 'react';
import { format } from 'date-fns';
import { useWaitlist, WaitlistEntry } from '@/hooks/useWaitlist';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useProfessionals } from '@/hooks/useProfessionals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { 
  Users, 
  Plus, 
  Trash2, 
  Calendar, 
} from 'lucide-react';

interface WaitlistPanelProps {
  onScheduleFromWaitlist?: (entry: WaitlistEntry) => void;
}

export function WaitlistPanel({ onScheduleFromWaitlist }: WaitlistPanelProps) {
  const { activeWaitlist, addToWaitlist, removeFromWaitlist, updateWaitlistStatus } = useWaitlist();
  const { clients } = useClients();
  const { services } = useServices();
  const { professionals } = useProfessionals();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [notes, setNotes] = useState('');

  const activeClients = clients.filter(c => c.is_active);
  const activeServices = services.filter(s => s.is_active);
  const activeProfessionals = professionals.filter(p => p.is_active);

  const handleAddToWaitlist = async () => {
    const client = clients.find(c => c.id === selectedClientId);
    const service = services.find(s => s.id === selectedServiceId);
    const professional = professionals.find(p => p.id === selectedProfessionalId);

    await addToWaitlist.mutateAsync({
      client_id: selectedClientId,
      service_id: selectedServiceId === 'any' ? null : selectedServiceId || null,
      professional_id: selectedProfessionalId === 'any' ? null : selectedProfessionalId || null,
      preferred_date: null,
      preferred_time_start: null,
      preferred_time_end: null,
      notes: notes || null,
      client: client ? { id: client.id, name: client.name, phone: client.phone } : undefined,
      service: service ? { id: service.id, name: service.name } : undefined,
      professional: professional ? { id: professional.id, name: professional.name } : undefined,
    });

    setDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedServiceId('');
    setSelectedProfessionalId('');
    setNotes('');
  };

  const getStatusBadge = (status: WaitlistEntry['status']) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="outline" className="text-warning border-warning">Aguardando</Badge>;
      case 'notified':
        return <Badge variant="outline" className="text-info border-info">Notificado</Badge>;
      case 'scheduled':
        return <Badge variant="outline" className="text-success border-success">Agendado</Badge>;
      case 'expired':
        return <Badge variant="outline" className="text-muted-foreground">Expirado</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lista de Espera
            {activeWaitlist.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {activeWaitlist.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mb-3"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar à Lista
          </Button>

          {activeWaitlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum cliente na lista de espera
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Adicione clientes que desejam horários cancelados
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {activeWaitlist.map((entry) => (
                  <div 
                    key={entry.id}
                    className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {entry.client?.name || 'Cliente'}
                          </span>
                          {getStatusBadge(entry.status)}
                        </div>
                        
                        {entry.service?.name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {entry.service.name}
                          </p>
                        )}
                        
                        {entry.professional?.name && (
                          <p className="text-xs text-muted-foreground">
                            Pref: {entry.professional.name}
                          </p>
                        )}

                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            "{entry.notes}"
                          </p>
                        )}

                        <p className="text-[10px] text-muted-foreground mt-1">
                          Adicionado em {format(new Date(entry.created_at), "d/MM 'às' HH:mm")}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onScheduleFromWaitlist?.(entry)}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeFromWaitlist.mutate(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add to Waitlist Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Lista de Espera</DialogTitle>
            <DialogDescription>
              O cliente será notificado automaticamente quando um horário compatível estiver disponível.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <SearchableSelect
                options={activeClients.map(c => ({ value: c.id, label: c.name }))}
                value={selectedClientId}
                onChange={setSelectedClientId}
                placeholder="Selecione o cliente"
              />
            </div>

            <div className="space-y-2">
              <Label>Serviço de Preferência</Label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer serviço</SelectItem>
                  {activeServices.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional de Preferência</Label>
              <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer profissional</SelectItem>
                  {activeProfessionals.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Prefere horários pela manhã"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddToWaitlist}
              disabled={!selectedClientId || addToWaitlist.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
