import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bot, MessageSquare, Users, LayoutGrid, TrendingUp, Zap } from 'lucide-react';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

const AutomationSettings = () => {
  const { settings, updateSettings, isLoading } = useBusinessSettings();

  const automations = [
    {
      key: 'automation_whatsapp_reminders' as const,
      icon: MessageSquare,
      title: 'Lembretes WhatsApp',
      description: 'Envia lembretes automáticos 24h e 1h antes do agendamento',
    },
    {
      key: 'automation_waitlist' as const,
      icon: Users,
      title: 'Lista de Espera',
      description: 'Notifica clientes da lista quando um horário é liberado',
    },
    {
      key: 'automation_gap_finder' as const,
      icon: Zap,
      title: 'Modo Encaixe',
      description: 'Identifica brechas na agenda para encaixes de última hora',
    },
    {
      key: 'automation_occupancy_dashboard' as const,
      icon: LayoutGrid,
      title: 'Dashboard de Ocupação',
      description: 'Exibe taxa de ocupação por dia, semana e profissional',
    },
    {
      key: 'automation_smart_recurrence' as const,
      icon: TrendingUp,
      title: 'Recorrência Inteligente',
      description: 'Sugere novos agendamentos baseado no histórico de visitas',
    },
  ];

  const handleToggle = (key: keyof typeof settings & string, checked: boolean) => {
    updateSettings.mutate({ [key]: checked });
  };

  if (isLoading) {
    return (
      <Card className="card-hover">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Automações da Agenda</CardTitle>
              <CardDescription className="text-xs">Carregando...</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Automações da Agenda</CardTitle>
            <CardDescription className="text-xs">Ative ou desative cada automação</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {automations.map((automation) => (
          <div key={automation.key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-muted p-1.5">
                <automation.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <Label className="text-xs font-medium">{automation.title}</Label>
                <p className="text-[10px] text-muted-foreground">{automation.description}</p>
              </div>
            </div>
            <Switch
              checked={settings?.[automation.key] ?? true}
              onCheckedChange={(checked) => handleToggle(automation.key, checked)}
              disabled={updateSettings.isPending}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default AutomationSettings;
