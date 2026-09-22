import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BellRing, CalendarPlus, CheckCircle2, XCircle, ListChecks, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useProfessionalPreferences } from '@/hooks/useProfessionalPreferences';
import {
  disableDevicePush,
  enableDevicePush,
  getPushSupportState,
  isDeviceSubscribed,
  sendTestPush,
  type PushSupportState,
} from '@/lib/pushNotifications';

/**
 * Avisos no celular/tablet: o profissional liga neste aparelho e escolhe
 * quais avisos quer receber, mesmo com o aplicativo fechado.
 */
export function AvisosCelularSettings() {
  const { prefs, update } = useProfessionalPreferences();
  const [support, setSupport] = useState<PushSupportState>('unsupported');
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(getPushSupportState());
    void isDeviceSubscribed().then(setDeviceOn);
  }, []);

  const masterOn = prefs?.push_enabled ?? true;

  const categories = [
    { key: 'push_appointment_new', icon: CalendarPlus, title: 'Novos agendamentos', desc: 'Quando marcarem um cliente com você' },
    { key: 'push_appointment_confirmed', icon: CheckCircle2, title: 'Confirmações', desc: 'Quando o cliente confirmar o horário' },
    { key: 'push_appointment_cancelled', icon: XCircle, title: 'Cancelamentos', desc: 'Quando um horário seu for desmarcado' },
    { key: 'push_reminders', icon: ListChecks, title: 'Lembretes', desc: 'Na hora dos lembretes que você criou' },
  ] as const;

  const handleToggleDevice = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const result = await enableDevicePush();
        if (!result.ok) {
          if (result.reason === 'needs-install') {
            toast.error('Salve o Hora Pro na tela inicial do aparelho para receber avisos.');
          } else if (result.reason === 'blocked') {
            toast.error('Os avisos estão bloqueados nas configurações do seu aparelho. Libere e tente de novo.');
          } else if (result.reason === 'unsupported') {
            toast.error('Este navegador não recebe avisos. Use o Chrome (Android) ou o Safari (iPhone).');
          } else {
            toast.error('Não foi possível ligar os avisos neste aparelho agora.');
          }
          return;
        }
        setDeviceOn(true);
        if (prefs?.push_enabled === false) update.mutate({ push_enabled: true });
        toast.success('Avisos ligados neste aparelho.');
      } else {
        await disableDevicePush();
        setDeviceOn(false);
        toast.success('Este aparelho não vai mais receber avisos.');
      }
    } catch {
      toast.error('Não foi possível concluir essa alteração agora.');
    } finally {
      setBusy(false);
      setSupport(getPushSupportState());
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const result = await sendTestPush();
      if (result.sent > 0) toast.success('Aviso de teste enviado para este aparelho.');
      else if (result.skipped === 'no_devices') toast.error('Ligue os avisos neste aparelho antes de testar.');
      else toast.error('Não foi possível enviar o aviso de teste agora.');
    } catch {
      toast.error('Não foi possível enviar o aviso de teste agora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="card-hover border-primary/30" data-testid="push-settings">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><BellRing className="h-4 w-4 text-primary" /></div>
          <div>
            <CardTitle className="text-sm font-medium">Avisos no celular e tablet</CardTitle>
            <CardDescription className="text-xs">
              Receba avisos da agenda e dos seus lembretes mesmo com o aplicativo fechado.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-muted p-1.5"><Smartphone className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div>
              <Label className="text-[11px] font-medium">Avisos neste aparelho</Label>
              <p className="text-[10px] text-muted-foreground">
                {support === 'needs-install'
                  ? 'No iPhone e iPad é preciso salvar o Hora Pro na tela inicial antes.'
                  : support === 'blocked'
                    ? 'Os avisos estão bloqueados nas configurações do aparelho.'
                    : support === 'unsupported'
                      ? 'Use o Chrome (Android) ou o Safari (iPhone) para receber avisos.'
                      : deviceOn
                        ? 'Este aparelho está pronto para receber avisos.'
                        : 'Ligue para receber avisos com a tela apagada.'}
              </p>
            </div>
          </div>
          <Switch
            data-testid="push-device-toggle"
            checked={deviceOn}
            disabled={busy || support !== 'supported'}
            onCheckedChange={(v) => void handleToggleDevice(v)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-[11px] font-medium">Quero receber avisos</Label>
            <p className="text-[10px] text-muted-foreground">Desligue para pausar todos os avisos, em qualquer aparelho.</p>
          </div>
          <Switch
            data-testid="push-master-toggle"
            checked={masterOn}
            onCheckedChange={(v) => update.mutate({ push_enabled: v })}
          />
        </div>

        <div className="space-y-1 border-t pt-3">
          {categories.map(({ key, icon: Icon, title, desc }) => (
            <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-muted p-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                <div>
                  <Label className="text-[11px] font-medium">{title}</Label>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch
                checked={(prefs?.[key] ?? true) as boolean}
                disabled={!masterOn}
                onCheckedChange={(v) => update.mutate({ [key]: v } as never)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !deviceOn} onClick={() => void handleTest()}>
            Enviar aviso de teste
          </Button>
          {deviceOn && masterOn && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5">Aparelho pareado</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
