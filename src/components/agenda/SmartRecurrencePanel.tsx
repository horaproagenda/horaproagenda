import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSmartRecurrence } from '@/hooks/useSmartRecurrence';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  RefreshCw, 
  Calendar, 
  MessageCircle, 
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SmartRecurrencePanelProps {
  onScheduleClient?: (clientId: string, serviceId: string, suggestedDate: Date) => void;
}

export function SmartRecurrencePanel({ onScheduleClient }: SmartRecurrencePanelProps) {
  const { highPrioritySuggestions, upcomingSuggestions } = useSmartRecurrence();
  const { sendMessage, connectionStatus } = useWhatsapp();

  const handleSendReminder = async (suggestion: typeof highPrioritySuggestions[0]) => {
    if (!connectionStatus?.connected) {
      toast.error('WhatsApp não conectado');
      return;
    }

    if (!suggestion.clientPhone) {
      toast.error('Cliente não tem telefone cadastrado');
      return;
    }

    const message = `Olá ${suggestion.clientName}! 👋

Percebemos que faz *${suggestion.daysOverdue} dias* desde seu último ${suggestion.serviceName}.

Baseado no seu histórico, você costuma retornar a cada *${suggestion.averageInterval} dias*.

Que tal agendar sua próxima sessão? 📅

Responda para verificar disponibilidade! ✨`;

    const success = await sendMessage(suggestion.clientPhone, message);
    if (success) {
      toast.success('Lembrete enviado com sucesso!');
    }
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-success/20 text-success border-success/30">Alta precisão</Badge>;
      case 'medium':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Média precisão</Badge>;
      case 'low':
        return <Badge className="bg-muted text-muted-foreground">Baixa precisão</Badge>;
    }
  };

  const allSuggestions = [...highPrioritySuggestions, ...upcomingSuggestions];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Recorrência Inteligente
          {allSuggestions.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {allSuggestions.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allSuggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhuma sugestão no momento
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sugestões aparecem baseadas no histórico de agendamentos
            </p>
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {/* High Priority (Overdue) */}
              {highPrioritySuggestions.length > 0 && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    <span className="text-xs font-medium text-warning">Retorno Atrasado</span>
                  </div>
                  {highPrioritySuggestions.map((suggestion, idx) => (
                    <SuggestionCard
                      key={`high-${idx}`}
                      suggestion={suggestion}
                      isOverdue
                      onSchedule={() => onScheduleClient?.(
                        suggestion.clientId, 
                        suggestion.serviceId, 
                        suggestion.suggestedDate
                      )}
                      onSendReminder={() => handleSendReminder(suggestion)}
                      getConfidenceBadge={getConfidenceBadge}
                    />
                  ))}
                </>
              )}

              {/* Upcoming Suggestions */}
              {upcomingSuggestions.length > 0 && (
                <>
                  <div className="flex items-center gap-2 py-1 mt-3">
                    <TrendingUp className="h-3 w-3 text-info" />
                    <span className="text-xs font-medium text-info">Próximos Retornos</span>
                  </div>
                  {upcomingSuggestions.map((suggestion, idx) => (
                    <SuggestionCard
                      key={`upcoming-${idx}`}
                      suggestion={suggestion}
                      isOverdue={false}
                      onSchedule={() => onScheduleClient?.(
                        suggestion.clientId, 
                        suggestion.serviceId, 
                        suggestion.suggestedDate
                      )}
                      onSendReminder={() => handleSendReminder(suggestion)}
                      getConfidenceBadge={getConfidenceBadge}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface SuggestionCardProps {
  suggestion: {
    clientId: string;
    clientName: string;
    clientPhone: string | null;
    serviceId: string;
    serviceName: string;
    averageInterval: number;
    lastAppointment: Date;
    suggestedDate: Date;
    daysOverdue: number;
    confidence: 'high' | 'medium' | 'low';
  };
  isOverdue: boolean;
  onSchedule: () => void;
  onSendReminder: () => void;
  getConfidenceBadge: (confidence: 'high' | 'medium' | 'low') => React.ReactNode;
}

function SuggestionCard({ 
  suggestion, 
  isOverdue, 
  onSchedule, 
  onSendReminder,
  getConfidenceBadge 
}: SuggestionCardProps) {
  return (
    <div 
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isOverdue 
          ? "bg-warning/5 border-warning/30" 
          : "bg-card hover:bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {suggestion.clientName}
            </span>
            {getConfidenceBadge(suggestion.confidence)}
          </div>
          
          <p className="text-xs text-muted-foreground mt-1">
            {suggestion.serviceName}
          </p>
          
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              A cada {suggestion.averageInterval} dias
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Último: {format(suggestion.lastAppointment, 'd/MM', { locale: ptBR })}
            </span>
          </div>

          {isOverdue && (
            <p className="text-xs text-warning mt-1 font-medium">
              ⚠️ {suggestion.daysOverdue} dias atrasado
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onSendReminder}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Enviar lembrete via WhatsApp</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onSchedule}
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agendar</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
