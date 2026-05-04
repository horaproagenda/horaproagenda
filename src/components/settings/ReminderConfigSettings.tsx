import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Bell } from 'lucide-react';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ReminderConfigSettings = () => {
  const { settings, updateSettings, isLoading } = useBusinessSettings();
  const [enabled, setEnabled] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.automation_whatsapp_reminders ?? true);
  }, [settings]);

  const save = () => {
    updateSettings.mutate({
      automation_whatsapp_reminders: enabled,
      reminder_provider: 'whatsapp',
    });
  };

  const runNow = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminders');
      if (error) throw error;
      toast.success(`Lembretes processados: ${data?.summary?.sent ?? 0} enviados`);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Envio Automático de Mensagens</CardTitle>
            <CardDescription className="text-xs">
              Os horários e textos de cada mensagem são definidos em <strong>Mensagens WhatsApp</strong>. O canal é sempre WhatsApp via Evolution API,
              usando o número conectado por profissional.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Envios automáticos ativos</Label>
            <p className="text-[11px] text-muted-foreground">
              Quando ativo, lembretes, pós-atendimento e aniversário são enviados conforme cada template.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={updateSettings.isPending}>
            Salvar
          </Button>
          <Button size="sm" variant="outline" onClick={runNow} disabled={testing}>
            {testing ? 'Executando...' : 'Disparar agora'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReminderConfigSettings;
