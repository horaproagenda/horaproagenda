import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, addDays, addMinutes, isWithinInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Check, X, RefreshCw, CalendarPlus, CalendarRange, MessageCircle, Pencil, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWhatsapp } from '@/hooks/useWhatsapp';

interface PackageSession {
  id: string;
  session_number: number;
  sequence_order?: number | null;
  interval_after_days?: number | null;
  service_id?: string | null;
  status: string;
  scheduled_date: string | null;
  appointment_id: string | null;
  service?: {
    name: string;
    duration: number;
  } | null;
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
  intervalDays?: number;
  clientPhone?: string;
  clientName?: string;
  onSessionRescheduled?: () => void;
}

interface ConflictInfo {
  hasConflict: boolean;
  reason?: string;
  suggestedDate?: Date;
}

export function PackageSessionsManager({ 
  packageId, 
  packageName,
  totalSessions,
  intervalDays = 7,
  clientPhone,
  clientName,
  onSessionRescheduled 
}: PackageSessionsManagerProps) {
  const [sessions, setSessions] = useState<PackageSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<PackageSession | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Mass reschedule state
  const [massRescheduleEnabled, setMassRescheduleEnabled] = useState(false);
  const [massRescheduleInterval, setMassRescheduleInterval] = useState(intervalDays);
  const [massReschedulePreview, setMassReschedulePreview] = useState<{sessionNumber: number, date: Date}[]>([]);
  const [editingPreviewIndex, setEditingPreviewIndex] = useState<number | null>(null);
  const [sendWhatsappNotification, setSendWhatsappNotification] = useState(true);
  
  // Conflict checking state
  const [packageInfo, setPackageInfo] = useState<{ professional_id: string | null; room_id: string | null; duration: number; package_type?: string | null } | null>(null);
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
  const [professionalAbsences, setProfessionalAbsences] = useState<any[]>([]);
  const [previewConflicts, setPreviewConflicts] = useState<Map<number, ConflictInfo>>(new Map());

  const { sendMessage: sendWhatsappMessage } = useWhatsapp();

  useEffect(() => {
    fetchSessions();
    fetchPackageInfo();
  }, [packageId]);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('package_appointments')
        .select(`
          *,
          service:services(name, duration),
          appointment:appointments (
            start_time,
            end_time,
            status
          )
        `)
        .eq('package_id', packageId)
        .order('sequence_order', { ascending: true });

      if (error) throw error;
      setSessions((data || []).map((session: any) => ({
        ...session,
        service: Array.isArray(session.service) ? session.service[0] : session.service,
      })) as PackageSession[]);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPackageInfo = async () => {
    try {
      const { data: pkg, error } = await supabase
        .from('service_packages')
        .select('professional_id, room_id, duration, package_type')
        .eq('id', packageId)
        .single();

      if (error) throw error;
      setPackageInfo(pkg);

      // Fetch existing appointments and absences if we have professional/room
      if (pkg?.professional_id || pkg?.room_id) {
        const [appointmentsRes, absencesRes] = await Promise.all([
          supabase
            .from('appointments')
            .select('id, start_time, end_time, professional_id, room_id, status')
            .not('status', 'eq', 'cancelled')
            .gte('start_time', new Date().toISOString()),
          pkg?.professional_id
            ? supabase
                .from('professional_absences')
                .select('*')
                .eq('professional_id', pkg.professional_id)
                .gte('end_time', new Date().toISOString())
            : Promise.resolve({ data: [], error: null })
        ]);

        if (appointmentsRes.data) setExistingAppointments(appointmentsRes.data);
        if (absencesRes.data) setProfessionalAbsences(absencesRes.data);
      }
    } catch (error) {
      console.error('Error fetching package info:', error);
    }
  };

  // Check for conflicts for a given date/time
  const checkConflict = (dateTime: Date): ConflictInfo => {
    if (!packageInfo) return { hasConflict: false };

    const duration = packageInfo.duration || 60;
    const endTime = addMinutes(dateTime, duration);

    // Check professional absences
    if (packageInfo.professional_id && professionalAbsences.length > 0) {
      for (const absence of professionalAbsences) {
        const absenceStart = parseISO(absence.start_time);
        const absenceEnd = parseISO(absence.end_time);
        
        if (
          (dateTime >= absenceStart && dateTime < absenceEnd) ||
          (endTime > absenceStart && endTime <= absenceEnd) ||
          (dateTime <= absenceStart && endTime >= absenceEnd)
        ) {
          return {
            hasConflict: true,
            reason: 'Profissional ausente',
            suggestedDate: findNextAvailableSlot(dateTime, duration)
          };
        }
      }
    }

    // Check existing appointments (professional conflict)
    if (packageInfo.professional_id) {
      for (const apt of existingAppointments) {
        if (apt.professional_id !== packageInfo.professional_id) continue;
        
        const aptStart = parseISO(apt.start_time);
        const aptEnd = parseISO(apt.end_time);
        
        if (
          (dateTime >= aptStart && dateTime < aptEnd) ||
          (endTime > aptStart && endTime <= aptEnd) ||
          (dateTime <= aptStart && endTime >= aptEnd)
        ) {
          return {
            hasConflict: true,
            reason: 'Profissional ocupado',
            suggestedDate: findNextAvailableSlot(dateTime, duration)
          };
        }
      }
    }

    // Check room conflicts
    if (packageInfo.room_id) {
      for (const apt of existingAppointments) {
        if (apt.room_id !== packageInfo.room_id) continue;
        
        const aptStart = parseISO(apt.start_time);
        const aptEnd = parseISO(apt.end_time);
        
        if (
          (dateTime >= aptStart && dateTime < aptEnd) ||
          (endTime > aptStart && endTime <= aptEnd) ||
          (dateTime <= aptStart && endTime >= aptEnd)
        ) {
          return {
            hasConflict: true,
            reason: 'Sala ocupada',
            suggestedDate: findNextAvailableSlot(dateTime, duration)
          };
        }
      }
    }

    return { hasConflict: false };
  };

  // Find next available slot
  const findNextAvailableSlot = (fromDate: Date, duration: number): Date => {
    let candidateDate = new Date(fromDate);
    const maxAttempts = 48; // Check up to 48 slots (full day)
    
    for (let i = 0; i < maxAttempts; i++) {
      candidateDate = addMinutes(candidateDate, 30);
      const candidateEnd = addMinutes(candidateDate, duration);
      
      let hasConflict = false;
      
      // Check absences
      for (const absence of professionalAbsences) {
        const absenceStart = parseISO(absence.start_time);
        const absenceEnd = parseISO(absence.end_time);
        if (
          (candidateDate >= absenceStart && candidateDate < absenceEnd) ||
          (candidateEnd > absenceStart && candidateEnd <= absenceEnd)
        ) {
          hasConflict = true;
          break;
        }
      }
      
      if (hasConflict) continue;
      
      // Check appointments
      for (const apt of existingAppointments) {
        if (packageInfo?.professional_id && apt.professional_id === packageInfo.professional_id) {
          const aptStart = parseISO(apt.start_time);
          const aptEnd = parseISO(apt.end_time);
          if (
            (candidateDate >= aptStart && candidateDate < aptEnd) ||
            (candidateEnd > aptStart && candidateEnd <= aptEnd)
          ) {
            hasConflict = true;
            break;
          }
        }
        if (packageInfo?.room_id && apt.room_id === packageInfo.room_id) {
          const aptStart = parseISO(apt.start_time);
          const aptEnd = parseISO(apt.end_time);
          if (
            (candidateDate >= aptStart && candidateDate < aptEnd) ||
            (candidateEnd > aptStart && candidateEnd <= aptEnd)
          ) {
            hasConflict = true;
            break;
          }
        }
      }
      
      if (!hasConflict) {
        return candidateDate;
      }
    }
    
    // If no slot found same day, try next day at same time
    return addDays(fromDate, 1);
  };

  // Check conflicts for all preview dates
  useEffect(() => {
    if (!massRescheduleEnabled || massReschedulePreview.length === 0) {
      setPreviewConflicts(new Map());
      return;
    }

    const conflicts = new Map<number, ConflictInfo>();
    for (const preview of massReschedulePreview) {
      const conflict = checkConflict(preview.date);
      conflicts.set(preview.sessionNumber, conflict);
    }
    setPreviewConflicts(conflicts);
  }, [massReschedulePreview, existingAppointments, professionalAbsences, packageInfo]);

  const hasAnyConflict = useMemo(() => {
    return Array.from(previewConflicts.values()).some(c => c.hasConflict);
  }, [previewConflicts]);

  const openRescheduleDialog = (session: PackageSession) => {
    setSelectedSession(session);
    setMassRescheduleEnabled(packageInfo?.package_type === 'sequential');
    setMassReschedulePreview([]);
    setMassRescheduleInterval(intervalDays);
    
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

  // Calculate mass reschedule preview
  useEffect(() => {
    if (!massRescheduleEnabled || !selectedSession || !newDate || !newTime) {
      setMassReschedulePreview([]);
      return;
    }

    const baseDate = new Date(`${newDate}T${newTime}:00`);
    const selectedOrder = selectedSession.sequence_order || selectedSession.session_number;
    const pendingSessions = sessions.filter(s => 
      (s.sequence_order || s.session_number) >= selectedOrder && 
      s.status !== 'completed' && 
      s.status !== 'missed' &&
      s.appointment?.status !== 'completed' &&
      s.appointment?.status !== 'missed'
    );

    let accumulatedDays = 0;
    const preview = pendingSessions.map((session, index) => {
      const date = addDays(baseDate, accumulatedDays);
      const interval = packageInfo?.package_type === 'sequential'
        ? session.interval_after_days || 0
        : massRescheduleInterval;
      accumulatedDays += index === pendingSessions.length - 1 ? 0 : interval;
      return { sessionNumber: session.session_number, date };
    });

    setMassReschedulePreview(preview);
  }, [massRescheduleEnabled, selectedSession, newDate, newTime, massRescheduleInterval, sessions, packageInfo?.package_type]);

  const handleReschedule = async () => {
    if (!selectedSession || !newDate || !newTime) return;

    setIsSaving(true);
    try {
      const newDateTime = new Date(`${newDate}T${newTime}:00`);

      if (massRescheduleEnabled && massReschedulePreview.length > 0) {
        // Mass reschedule all pending sessions
        for (const preview of massReschedulePreview) {
          const session = sessions.find(s => s.session_number === preview.sessionNumber);
          if (!session) continue;

          // If there's an existing appointment, update it
          if (session.appointment_id) {
            const duration = session.service?.duration || packageInfo?.duration || 60;
            const { error: aptError } = await supabase
              .from('appointments')
              .update({
                start_time: preview.date.toISOString(),
                end_time: addMinutes(preview.date, duration).toISOString(),
                status: 'rescheduled',
              })
              .eq('id', session.appointment_id);

            if (aptError) throw aptError;
          }

          // Update the package_appointment
          const { error: sessionError } = await supabase
            .from('package_appointments')
            .update({
              scheduled_date: preview.date.toISOString(),
              status: 'scheduled',
            })
            .eq('id', session.id);

          if (sessionError) throw sessionError;
        }

        toast.success(`${massReschedulePreview.length} sessões reagendadas com sucesso!`);

        // Send WhatsApp notification
        if (sendWhatsappNotification && clientPhone && clientName) {
          try {
            const sessionsList = massReschedulePreview.map((preview) => 
              `📅 Sessão ${preview.sessionNumber}: ${format(preview.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
            ).join('\n');

            const message = `Olá ${clientName}! 👋

Suas sessões do pacote *${packageName}* foram reagendadas:

${sessionsList}

Se precisar de qualquer ajuste, entre em contato conosco.

Até breve! ✨`;

            await sendWhatsappMessage(clientPhone, message);
            toast.success('Notificação WhatsApp enviada!');
          } catch (error) {
            console.error('Error sending WhatsApp notification:', error);
          }
        }
      } else {
        // Single session reschedule
        if (selectedSession.appointment_id) {
          const duration = selectedSession.service?.duration || packageInfo?.duration || 60;
          const { error: aptError } = await supabase
            .from('appointments')
            .update({
              start_time: newDateTime.toISOString(),
              end_time: addMinutes(newDateTime, duration).toISOString(),
              status: 'rescheduled',
            })
            .eq('id', selectedSession.appointment_id);

          if (aptError) throw aptError;
        }

        const { error: sessionError } = await supabase
          .from('package_appointments')
          .update({
            scheduled_date: newDateTime.toISOString(),
            status: selectedSession.status === 'completed' ? 'completed' : 'scheduled',
          })
          .eq('id', selectedSession.id);

        if (sessionError) throw sessionError;

        toast.success(`Sessão ${selectedSession.session_number} reagendada com sucesso!`);
      }

      setRescheduleDialogOpen(false);
      setMassRescheduleEnabled(false);
      setMassReschedulePreview([]);
      setEditingPreviewIndex(null);
      fetchSessions();
      onSessionRescheduled?.();
    } catch (error: any) {
      toast.error('Erro ao reagendar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Update a specific preview date
  const updatePreviewDate = (index: number, newDate: Date) => {
    setMassReschedulePreview(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], date: newDate };
      return updated;
    });
  };

  const isSessionMissed = (session: PackageSession) => {
    return session.appointment?.status === 'missed' || session.status === 'missed';
  };

  const isSessionCancelled = (session: PackageSession) => {
    return (session.appointment?.status === 'cancelled' || session.status === 'cancelled') && !isSessionMissed(session);
  };

  const isSessionCompleted = (session: PackageSession) => {
    return session.appointment?.status === 'completed' || session.status === 'completed';
  };

  const getStatusBadge = (session: PackageSession) => {
    if (isSessionCompleted(session)) {
      return <Badge variant="default" className="bg-green-500">Realizada</Badge>;
    }
    if (isSessionMissed(session)) {
      return <Badge variant="destructive" className="bg-orange-500">Faltou</Badge>;
    }
    if (isSessionCancelled(session)) {
      return <Badge variant="destructive">Cancelada</Badge>;
    }
    if (session.appointment || session.scheduled_date) {
      return <Badge variant="secondary">Agendada</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
  };

  // Missed sessions count as "consumed" - client loses the session
  const completedSessions = sessions.filter(s => 
    isSessionCompleted(s) || isSessionMissed(s)
  ).length;

  const scheduledSessions = sessions.filter(s => 
    s.status === 'scheduled' || (s.appointment && !['completed', 'cancelled', 'missed'].includes(s.appointment.status))
  ).length;

  const cancelledSessions = sessions.filter(s => isSessionCancelled(s)).length;

  const pendingSessions = sessions.filter(s => 
    s.status === 'pending' && !s.appointment
  ).length;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando sessões...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Progress Summary */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-600">{completedSessions}</p>
          <p className="text-xs text-muted-foreground">Realizadas/Faltou</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10">
          <p className="text-lg font-bold text-blue-600">{scheduledSessions}</p>
          <p className="text-xs text-muted-foreground">Agendadas</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <p className="text-lg font-bold text-red-600">{cancelledSessions}</p>
          <p className="text-xs text-muted-foreground">Canceladas</p>
        </div>
        <div className="p-2 rounded-lg bg-gray-500/10">
          <p className="text-lg font-bold text-gray-600">{pendingSessions}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </div>
      </div>

      {/* Mass Reschedule All Pending Button */}
      {(pendingSessions + cancelledSessions) > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full flex items-center gap-2"
          onClick={() => {
            const firstAvailable = sessions.find(s => 
              (s.status === 'pending' && !s.appointment) || isSessionCancelled(s)
            );
            if (firstAvailable) {
              openRescheduleDialog(firstAvailable);
              setTimeout(() => setMassRescheduleEnabled(true), 100);
            }
          }}
        >
          <CalendarRange className="h-4 w-4" />
          Reagendar {pendingSessions + cancelledSessions} sessões disponíveis
        </Button>
      )}

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
                {session.service?.name && (
                  <p className="text-xs font-medium text-primary">{session.service.name}</p>
                )}
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
              {/* Cancelled sessions can be rescheduled */}
              {isSessionCancelled(session) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openRescheduleDialog(session)}
                  title="Reagendar sessão cancelada"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {/* Pending/Scheduled sessions can be rescheduled */}
              {!isSessionCompleted(session) && !isSessionMissed(session) && !isSessionCancelled(session) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openRescheduleDialog(session)}
                  title="Reagendar"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {/* Missed sessions: no action - session is consumed */}
              {isSessionMissed(session) && (
                <span className="text-[10px] text-muted-foreground">Sem reposição</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => {
        setRescheduleDialogOpen(open);
        if (!open) {
          setMassRescheduleEnabled(false);
          setMassReschedulePreview([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5" />
              Reagendar Sessão {selectedSession?.session_number}
            </DialogTitle>
            <DialogDescription>
              Altere a data e horário desta sessão
            </DialogDescription>
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

            {/* Mass Reschedule Option */}
            {selectedSession && sessions.filter(s => 
              s.session_number > selectedSession.session_number && 
              s.status !== 'completed' && 
              s.appointment?.status !== 'completed'
            ).length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <CalendarRange className="h-4 w-4" />
                      {packageInfo?.package_type === 'sequential' ? 'Reagendamento automático' : 'Reagendar em Massa'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {packageInfo?.package_type === 'sequential'
                        ? 'As próximas etapas serão ajustadas pelos intervalos do pacote'
                        : 'Reagendar também as sessões pendentes seguintes'}
                    </p>
                  </div>
                  <Switch
                    checked={massRescheduleEnabled}
                    onCheckedChange={setMassRescheduleEnabled}
                    disabled={packageInfo?.package_type === 'sequential'}
                  />
                </div>

                {massRescheduleEnabled && (
                  <div className="space-y-3 pt-2 border-t">
                    {packageInfo?.package_type !== 'sequential' && <div>
                      <Label className="text-xs">Intervalo entre sessões (dias)</Label>
                      <Select
                        value={massRescheduleInterval.toString()}
                        onValueChange={(v) => setMassRescheduleInterval(parseInt(v))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[3, 5, 7, 10, 14, 21, 28, 30].map(days => (
                            <SelectItem key={days} value={days.toString()}>
                              {days} dias
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>}

                    {/* Conflict Alert with Auto-resolve */}
                    {hasAnyConflict && (
                      <Alert variant="destructive" className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs flex items-center justify-between gap-2">
                          <span>Algumas sessões têm conflitos de horário.</span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-6 text-xs shrink-0"
                            onClick={() => {
                              // Auto-resolve all conflicts
                              const updated = massReschedulePreview.map((preview, index) => {
                                const conflict = previewConflicts.get(preview.sessionNumber);
                                if (conflict?.hasConflict && conflict.suggestedDate) {
                                  return { ...preview, date: conflict.suggestedDate };
                                }
                                return preview;
                              });
                              setMassReschedulePreview(updated);
                            }}
                          >
                            Auto-resolver todos
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Preview of mass reschedule with edit capability */}
                    {massReschedulePreview.length > 0 && (
                      <div className="p-2 bg-background rounded border max-h-[200px] overflow-y-auto">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Visualização ({massReschedulePreview.length} sessões)
                          </p>
                          <span className="text-[9px] text-muted-foreground">Clique para editar</span>
                        </div>
                        <div className="space-y-1">
                          {massReschedulePreview.map((preview, index) => {
                            const conflict = previewConflicts.get(preview.sessionNumber);
                            return (
                              <div 
                                key={preview.sessionNumber} 
                                className={`flex items-center gap-2 text-xs p-1 rounded ${
                                  conflict?.hasConflict ? 'bg-destructive/10 border border-destructive/30' : ''
                                }`}
                              >
                                <Badge 
                                  variant={conflict?.hasConflict ? "destructive" : index === 0 ? "default" : "outline"} 
                                  className="w-5 h-5 p-0 flex items-center justify-center text-[10px] shrink-0"
                                >
                                  {preview.sessionNumber}
                                </Badge>
                                {editingPreviewIndex === index ? (
                                  <Input
                                    type="datetime-local"
                                    className="h-6 text-xs flex-1"
                                    value={format(preview.date, "yyyy-MM-dd'T'HH:mm")}
                                    onChange={(e) => {
                                      const newDate = new Date(e.target.value);
                                      if (!isNaN(newDate.getTime())) {
                                        updatePreviewDate(index, newDate);
                                      }
                                    }}
                                    onBlur={() => setEditingPreviewIndex(null)}
                                    autoFocus
                                  />
                                ) : (
                                  <div className="flex-1 flex items-center gap-1">
                                    <button
                                      type="button"
                                      className="flex-1 text-left hover:bg-muted/50 rounded px-1 py-0.5 flex items-center gap-1"
                                      onClick={() => setEditingPreviewIndex(index)}
                                    >
                                      <span className={`${index === 0 ? "font-medium" : "text-muted-foreground"} ${conflict?.hasConflict ? 'text-destructive' : ''}`}>
                                        {format(preview.date, "dd/MM 'às' HH:mm", { locale: ptBR })}
                                      </span>
                                      {conflict?.hasConflict && (
                                        <AlertTriangle className="h-3 w-3 text-destructive" />
                                      )}
                                      <Pencil className="h-2.5 w-2.5 opacity-50" />
                                    </button>
                                    {conflict?.hasConflict && conflict.suggestedDate && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 px-1 text-[10px] text-primary"
                                        onClick={() => updatePreviewDate(index, conflict.suggestedDate!)}
                                      >
                                        Usar {format(conflict.suggestedDate, "HH:mm")}
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {conflict?.hasConflict && (
                                  <span className="text-[9px] text-destructive shrink-0">
                                    {conflict.reason}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* WhatsApp notification toggle */}
                    {massReschedulePreview.length > 0 && clientPhone && (
                      <div className="flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-3 w-3 text-green-600" />
                          <span className="text-xs font-medium">Notificar WhatsApp</span>
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
                disabled={isSaving || !newDate || !newTime || (massRescheduleEnabled && hasAnyConflict)}
                className="flex-1"
              >
                {isSaving 
                  ? 'Salvando...' 
                  : massRescheduleEnabled && hasAnyConflict
                    ? 'Resolva os conflitos'
                    : massRescheduleEnabled 
                      ? `Reagendar ${massReschedulePreview.length} sessões` 
                      : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
