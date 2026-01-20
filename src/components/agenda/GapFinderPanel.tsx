import React, { useMemo } from 'react';
import { format, isSameDay, differenceInMinutes, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAppointments } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useProfessionalAbsences } from '@/hooks/useProfessionalAbsences';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, User, Plus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Gap {
  start: Date;
  end: Date;
  duration: number;
  professionalId: string;
  professionalName: string;
  roomId?: string;
  roomName?: string;
}

interface GapFinderPanelProps {
  selectedDate: Date;
  onSelectGap?: (gap: Gap) => void;
  minGapMinutes?: number;
}

export function GapFinderPanel({ 
  selectedDate, 
  onSelectGap,
  minGapMinutes = 30 
}: GapFinderPanelProps) {
  const { appointments } = useAppointments();
  const { professionals } = useProfessionals();
  const { settings } = useBusinessSettings();
  const { absences } = useProfessionalAbsences();

  const activeProfessionals = useMemo(() => 
    professionals.filter(p => p.is_active),
    [professionals]
  );

  // Find available gaps for the selected date
  const availableGaps = useMemo(() => {
    if (!settings?.opening_time || !settings?.closing_time) return [];

    const gaps: Gap[] = [];
    const now = new Date();
    
    // Parse business hours
    const [openH, openM] = settings.opening_time.split(':').map(Number);
    const [closeH, closeM] = settings.closing_time.split(':').map(Number);
    
    const dayStart = new Date(selectedDate);
    dayStart.setHours(openH, openM, 0, 0);
    
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(closeH, closeM, 0, 0);

    // For each professional, find gaps
    activeProfessionals.forEach(prof => {
      // Get professional's appointments for the day
      const profApts = appointments
        .filter(apt => 
          isSameDay(new Date(apt.start_time), selectedDate) &&
          (apt.professional_id === prof.id || apt.service?.professional_id === prof.id) &&
          !['cancelled', 'missed', 'rescheduled'].includes(apt.status)
        )
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      // Get professional's absences for the day
      const profAbsences = absences.filter(abs => 
        abs.professional_id === prof.id &&
        isSameDay(new Date(abs.start_time), selectedDate)
      );

      // Build blocked time ranges
      const blockedRanges: { start: Date; end: Date }[] = [
        ...profApts.map(apt => ({
          start: new Date(apt.start_time),
          end: new Date(apt.end_time),
        })),
        ...profAbsences.map(abs => ({
          start: new Date(abs.start_time),
          end: new Date(abs.end_time),
        })),
      ].sort((a, b) => a.start.getTime() - b.start.getTime());

      // Find gaps between blocked ranges
      let currentTime = dayStart;

      blockedRanges.forEach(blocked => {
        if (isAfter(blocked.start, currentTime)) {
          const gapDuration = differenceInMinutes(blocked.start, currentTime);
          if (gapDuration >= minGapMinutes) {
            // Skip if gap is in the past
            if (isSameDay(selectedDate, now) && isBefore(blocked.start, now)) {
              currentTime = blocked.end;
              return;
            }

            // Adjust start time if it's in the past
            let gapStart = currentTime;
            if (isSameDay(selectedDate, now) && isBefore(currentTime, now)) {
              // Round up to next 15-minute slot
              gapStart = new Date(now);
              gapStart.setMinutes(Math.ceil(gapStart.getMinutes() / 15) * 15, 0, 0);
            }

            if (isAfter(blocked.start, gapStart)) {
              const adjustedDuration = differenceInMinutes(blocked.start, gapStart);
              if (adjustedDuration >= minGapMinutes) {
                gaps.push({
                  start: gapStart,
                  end: blocked.start,
                  duration: adjustedDuration,
                  professionalId: prof.id,
                  professionalName: prof.name,
                });
              }
            }
          }
        }
        currentTime = blocked.end;
      });

      // Check gap after last blocked range until day end
      if (isBefore(currentTime, dayEnd)) {
        let gapStart = currentTime;
        if (isSameDay(selectedDate, now) && isBefore(currentTime, now)) {
          gapStart = new Date(now);
          gapStart.setMinutes(Math.ceil(gapStart.getMinutes() / 15) * 15, 0, 0);
        }

        if (isBefore(gapStart, dayEnd)) {
          const gapDuration = differenceInMinutes(dayEnd, gapStart);
          if (gapDuration >= minGapMinutes) {
            gaps.push({
              start: gapStart,
              end: dayEnd,
              duration: gapDuration,
              professionalId: prof.id,
              professionalName: prof.name,
            });
          }
        }
      }
    });

    // Sort by start time
    return gaps.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [appointments, activeProfessionals, absences, settings, selectedDate, minGapMinutes]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h${mins}min`;
  };

  const getDurationColor = (minutes: number) => {
    if (minutes >= 60) return 'bg-success/10 text-success border-success/30';
    if (minutes >= 45) return 'bg-primary/10 text-primary border-primary/30';
    return 'bg-warning/10 text-warning border-warning/30';
  };

  if (availableGaps.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Modo Encaixe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum horário disponível para encaixe em {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Modo Encaixe
          <Badge variant="secondary" className="ml-auto">
            {availableGaps.length} vagas
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {availableGaps.map((gap, idx) => (
              <div 
                key={idx}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border transition-colors",
                  "hover:bg-muted/50 cursor-pointer",
                  getDurationColor(gap.duration)
                )}
                onClick={() => onSelectGap?.(gap)}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {format(gap.start, 'HH:mm')} - {format(gap.end, 'HH:mm')}
                  </span>
                  <span className="text-xs opacity-70">
                    {formatDuration(gap.duration)}
                  </span>
                </div>
                
                <div className="flex-1 flex items-center gap-2">
                  <User className="h-3 w-3 opacity-50" />
                  <span className="text-xs truncate">{gap.professionalName}</span>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGap?.(gap);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Agendar encaixe</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
