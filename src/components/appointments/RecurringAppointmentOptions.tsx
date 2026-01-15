import { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Pencil, AlertTriangle, CheckCircle, MessageCircle, Repeat, Info } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Appointment } from '@/types';

interface RecurringAppointmentOptionsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  repeatCount: number;
  onRepeatCountChange: (count: number) => void;
  returnDays: number;
  onReturnDaysChange: (days: number) => void;
  preferredTime: string;
  onPreferredTimeChange: (time: string) => void;
  timeSlots: string[];
  firstAppointmentDate: Date | undefined;
  firstAppointmentTime: string;
  serviceDuration: number;
  sendWhatsapp: boolean;
  onSendWhatsappChange: (send: boolean) => void;
  editableDates: Date[];
  onEditableDatesChange: (dates: Date[]) => void;
  checkConflicts: (start: Date, end: Date) => { type: string; message: string }[];
  isWorkDay: (date: Date) => boolean;
}

export function RecurringAppointmentOptions({
  enabled,
  onEnabledChange,
  repeatCount,
  onRepeatCountChange,
  returnDays,
  onReturnDaysChange,
  preferredTime,
  onPreferredTimeChange,
  timeSlots,
  firstAppointmentDate,
  firstAppointmentTime,
  serviceDuration,
  sendWhatsapp,
  onSendWhatsappChange,
  editableDates,
  onEditableDatesChange,
  checkConflicts,
  isWorkDay,
}: RecurringAppointmentOptionsProps) {
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null);

  // Calculate preview dates when parameters change
  useEffect(() => {
    if (!enabled || !firstAppointmentDate || !firstAppointmentTime || repeatCount < 1) {
      onEditableDatesChange([]);
      return;
    }

    const [hours, minutes] = firstAppointmentTime.split(':').map(Number);
    const firstDate = new Date(firstAppointmentDate);
    firstDate.setHours(hours, minutes, 0, 0);

    const dates: Date[] = [firstDate];
    const timeToUse = preferredTime || firstAppointmentTime;
    const [prefHours, prefMinutes] = timeToUse.split(':').map(Number);

    for (let i = 1; i < repeatCount; i++) {
      let futureDate = addDays(firstDate, returnDays * i);
      
      // Skip non-work days
      while (!isWorkDay(futureDate)) {
        futureDate = addDays(futureDate, 1);
      }

      futureDate.setHours(prefHours, prefMinutes, 0, 0);
      dates.push(futureDate);
    }

    onEditableDatesChange(dates);
  }, [enabled, firstAppointmentDate, firstAppointmentTime, repeatCount, returnDays, preferredTime, isWorkDay]);

  // Check conflicts for all dates
  const dateConflicts = useMemo(() => {
    if (!enabled || editableDates.length === 0) return [];

    return editableDates.map((date, index) => {
      const endTime = new Date(date);
      endTime.setMinutes(endTime.getMinutes() + serviceDuration);
      
      const conflicts = checkConflicts(date, endTime);
      
      // Find alternative if there are conflicts
      let suggestedDate: Date | null = null;
      if (conflicts.length > 0) {
        // Try next slots on the same day
        const timeSlotIndex = timeSlots.findIndex(slot => slot === format(date, 'HH:mm'));
        
        for (let i = timeSlotIndex + 1; i < timeSlots.length; i++) {
          const [slotHours, slotMinutes] = timeSlots[i].split(':').map(Number);
          const testDate = new Date(date);
          testDate.setHours(slotHours, slotMinutes, 0, 0);
          const testEnd = new Date(testDate);
          testEnd.setMinutes(testEnd.getMinutes() + serviceDuration);
          
          if (checkConflicts(testDate, testEnd).length === 0) {
            suggestedDate = testDate;
            break;
          }
        }
        
        // If no slot available on the same day, try next work day
        if (!suggestedDate) {
          let tryDate = addDays(date, 1);
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            if (isWorkDay(tryDate)) {
              const testEnd = new Date(tryDate);
              testEnd.setMinutes(testEnd.getMinutes() + serviceDuration);
              
              if (checkConflicts(tryDate, testEnd).length === 0) {
                suggestedDate = tryDate;
                break;
              }
            }
            tryDate = addDays(tryDate, 1);
          }
        }
      }
      
      return { index, conflicts, suggestedDate };
    });
  }, [editableDates, enabled, serviceDuration, checkConflicts, timeSlots, isWorkDay]);

  const hasConflicts = dateConflicts.some(dc => dc.conflicts.length > 0);

  const updateEditableDate = (index: number, newDate: Date) => {
    const updated = [...editableDates];
    updated[index] = newDate;
    onEditableDatesChange(updated);
  };

  if (!firstAppointmentDate || !firstAppointmentTime) {
    return null;
  }

  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Repetir Agendamento
          </Label>
          <p className="text-xs text-muted-foreground">
            Criar múltiplos agendamentos do mesmo serviço
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Quantidade de vezes</Label>
              <Input
                type="number"
                min={2}
                max={52}
                value={repeatCount}
                onChange={(e) => onRepeatCountChange(Math.max(2, Math.min(52, parseInt(e.target.value) || 2)))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Intervalo (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={returnDays}
                onChange={(e) => onReturnDaysChange(Math.max(1, parseInt(e.target.value) || 7))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Horário preferido</Label>
            <Select
              value={preferredTime || '_same'}
              onValueChange={(v) => onPreferredTimeChange(v === '_same' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Mesmo horário" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="_same">Mesmo horário ({firstAppointmentTime})</SelectItem>
                {timeSlots.map(slot => (
                  <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Alert className="py-2">
            <Info className="h-3 w-3" />
            <AlertDescription className="text-xs">
              Serão criados <strong>{repeatCount}</strong> agendamentos com intervalo de <strong>{returnDays}</strong> dia(s)
            </AlertDescription>
          </Alert>

          {/* Preview of scheduled dates */}
          {editableDates.length > 0 && (
            <div className="mt-3 p-3 bg-background rounded-md border max-h-[280px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Visualização das Sessões</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Clique para editar</span>
              </div>
              
              {hasConflicts && (
                <Alert variant="destructive" className="mb-2 py-2">
                  <AlertTriangle className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    Algumas datas têm conflitos. Altere ou aceite as sugestões.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                {editableDates.map((previewDate, index) => {
                  const conflictInfo = dateConflicts.find(dc => dc.index === index);
                  const hasDateConflict = conflictInfo && conflictInfo.conflicts.length > 0;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className={cn(
                        "flex items-center gap-2 text-xs p-1 rounded",
                        hasDateConflict && "bg-destructive/10 border border-destructive/30"
                      )}>
                        <Badge 
                          variant={hasDateConflict ? "destructive" : index === 0 ? "default" : "outline"} 
                          className="w-6 h-6 p-0 flex items-center justify-center text-[10px] shrink-0"
                        >
                          {hasDateConflict ? <AlertTriangle className="h-3 w-3" /> : index + 1}
                        </Badge>
                        {editingDateIndex === index ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              type="datetime-local"
                              className="h-7 text-xs flex-1"
                              value={format(previewDate, "yyyy-MM-dd'T'HH:mm")}
                              onChange={(e) => {
                                const newDate = new Date(e.target.value);
                                if (!isNaN(newDate.getTime())) {
                                  updateEditableDate(index, newDate);
                                }
                              }}
                              onBlur={() => setEditingDateIndex(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingDateIndex(null);
                              }}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={cn(
                              "flex-1 text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors flex items-center gap-1",
                              index === 0 ? "font-medium" : "text-muted-foreground",
                              hasDateConflict && "text-destructive"
                            )}
                            onClick={() => setEditingDateIndex(index)}
                          >
                            {format(previewDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                            <Pencil className="h-3 w-3 opacity-50" />
                          </button>
                        )}
                        {index === 0 && !hasDateConflict && <Badge variant="secondary" className="text-[10px] shrink-0">Primeira</Badge>}
                      </div>
                      
                      {/* Show conflict details and suggestion */}
                      {hasDateConflict && conflictInfo && (
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
          {editableDates.length > 0 && (
            <div className="mt-3 flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium">Notificar por WhatsApp</span>
              </div>
              <Switch
                checked={sendWhatsapp}
                onCheckedChange={onSendWhatsappChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
