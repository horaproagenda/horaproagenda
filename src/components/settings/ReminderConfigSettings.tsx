import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bell, Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PROVIDERS = [
  { value: 'whatsapp', label: 'WhatsApp (Evolution API)' },
  { value: 'twilio_whatsapp', label: 'WhatsApp via Twilio' },
  { value: 'twilio_sms', label: 'SMS via Twilio' },
];

const ReminderConfigSettings = () => {
  const { settings, updateSettings, isLoading } = useBusinessSettings();
  const [hours, setHours] = useState<number[]>([24, 1]);
  const [newHour, setNewHour] = useState('');
  const [provider, setProvider] = useState<string>('whatsapp');
  const [twilioFrom, setTwilioFrom] = useState<string>('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setHours(settings.reminder_hours_before?.length ? settings.reminder_hours_before : [24, 1]);
    setProvider(settings.reminder_provider || 'whatsapp');
    setTwilioFrom(settings.twilio_from_number || '');
  }, [settings]);

  const addHour = () => {
    const n = Number(newHour);
    if (!Number.isFinite(n) || n <= 0 || n > 168) {
      toast.error('Informe um número entre 1 e 168 horas');
      return;
    }
    if (hours.includes(n)) return;
    setHours([...hours, n].sort((a, b) => b - a));
    setNewHour('');
  };

  const removeHour = (h: number) => setHours(hours.filter(x => x !== h));

  const save = () => {
    updateSettings.mutate({
      reminder_hours_before: hours,
      reminder_provider: provider as any,
      twilio_from_number: twilioFrom || null,
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
            <CardTitle className="text-sm font-medium">Lembretes Automáticos</CardTitle>
            <CardDescription className="text-xs">Configure quando e como os lembretes serão enviados</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Horas antes do agendamento</Label>
          <div className="flex flex-wrap gap-2">
            {hours.map(h => (
              <Badge key={h} variant="secondary" className="gap-1">
                {h}h
                <button onClick={() => removeHour(h)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={168}
              placeholder="Ex: 48"
              value={newHour}
              onChange={(e) => setNewHour(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={addHour}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Canal de envio</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map(p => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider.startsWith('twilio') && (
          <div className="space-y-2">
            <Label className="text-xs">Número Twilio (remetente)</Label>
            <Input
              placeholder={provider === 'twilio_whatsapp' ? 'whatsapp:+14155238886' : '+15558675310'}
              value={twilioFrom}
              onChange={(e) => setTwilioFrom(e.target.value)}
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Use formato E.164. Para WhatsApp Twilio, prefixe com "whatsapp:".
            </p>
          </div>
        )}

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
