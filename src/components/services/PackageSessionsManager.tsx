import { useState, useEffect } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Check, X, RefreshCw, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PackageSession {
  id: string;
  session_number: number;
  status: string;
  scheduled_date: string | null;
  appointment_id: string | null;
  appointment?: {
    start_time: string;
    end_time: string;
    status: string;
  } | null;
}

interface PackageSessionsManagerProps {
  packageId: string;
  packageName: string;
  totalSessions: number;
  onSessionRescheduled?: () => void;
}

export function PackageSessionsManager({ 
  packageId, 
  packageName,
  totalSessions,
  onSessionRescheduled 
}: PackageSessionsManagerProps) {
  const [sessions, setSessions] = useState<PackageSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<PackageSession | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [packageId]);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`
          *,
          appointment:appointments (
            start_time,
            end_time,
            status
          )
        `)
        .eq('package_id', packageId)
        .order('session_number', { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openRescheduleDialog = (session: PackageSession) => {
    setSelectedSession(session);
    if (session.appointment?.start_time) {
      const date = parseISO(session.appointment.start_time);
      setNewDate(format(date, 'yyyy-MM-dd'));
      setNewTime(format(date, 'HH:mm'));
    } else if (session.scheduled_date) {
      const date = parseISO(session.scheduled_date);
      setNewDate(format(date, 'yyyy-MM-dd'));
      setNewTime('09:00');
    } else {
      setNewDate(format(new Date(), 'yyyy-MM-dd'));
      setNewTime('09:00');
    }
    setRescheduleDialogOpen(true);
  };

  const handleReschedule = async () => {
    if (!selectedSession || !newDate || !newTime) return;

    setIsSaving(true);
    try {
      const newDateTime = new Date(`${newDate}T${newTime}:00`);

      // If there's an existing appointment, update it
      if (selectedSession.appointment_id) {
        const { error: aptError } = await supabase
          .from('appointments')
          .update({
            start_time: newDateTime.toISOString(),
            end_time: addDays(newDateTime, 0).toISOString(), // Will be adjusted by duration
            status: 'rescheduled',
          })
          .eq('id', selectedSession.appointment_id);

        if (aptError) throw aptError;
      }

      // Update the package_appointment
      const { error: sessionError } = await supabase
        .from('package_appointments')
        .update({
          scheduled_date: newDateTime.toISOString(),
          status: selectedSession.status === 'completed' ? 'completed' : 'scheduled',
        })
        .eq('id', selectedSession.id);

      if (sessionError) throw sessionError;

      toast.success(`Sessão ${selectedSession.session_number} reagendada com sucesso!`);
      setRescheduleDialogOpen(false);
      fetchSessions();
      onSessionRescheduled?.();
    } catch (error: any) {
      toast.error('Erro ao reagendar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (session: PackageSession) => {
    if (session.appointment?.status === 'completed' || session.status === 'completed') {
      return <Badge variant="default" className="bg-green-500">Realizada</Badge>;
    }
    if (session.appointment?.status === 'cancelled' || session.status === 'cancelled') {
      return <Badge variant="destructive">Cancelada</Badge>;
    }
    if (session.appointment || session.scheduled_date) {
      return <Badge variant="secondary">Agendada</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
  };

  const completedSessions = sessions.filter(s => 
    s.status === 'completed' || s.appointment?.status === 'completed'
  ).length;

  const scheduledSessions = sessions.filter(s => 
    s.status === 'scheduled' || (s.appointment && s.appointment.status !== 'completed' && s.appointment.status !== 'cancelled')
  ).length;

  const pendingSessions = sessions.filter(s => 
    s.status === 'pending' && !s.appointment
  ).length;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando sessões...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Progress Summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-600">{completedSessions}</p>
          <p className="text-xs text-muted-foreground">Realizadas</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10">
          <p className="text-lg font-bold text-blue-600">{scheduledSessions}</p>
          <p className="text-xs text-muted-foreground">Agendadas</p>
        </div>
        <div className="p-2 rounded-lg bg-gray-500/10">
          <p className="text-lg font-bold text-gray-600">{pendingSessions}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                {session.session_number}
              </div>
              <div>
                <p className="text-sm font-medium">Sessão {session.session_number}</p>
                {session.appointment?.start_time ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(session.appointment.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                ) : session.scheduled_date ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(session.scheduled_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Não agendada</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(session)}
              {session.status !== 'completed' && session.appointment?.status !== 'completed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openRescheduleDialog(session)}
                  title="Reagendar"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5" />
              Reagendar Sessão {selectedSession?.session_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nova Data</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Novo Horário</Label>
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRescheduleDialogOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReschedule}
                disabled={isSaving || !newDate || !newTime}
                className="flex-1"
              >
                {isSaving ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
