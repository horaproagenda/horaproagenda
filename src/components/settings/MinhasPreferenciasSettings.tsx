import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, GripVertical, CalendarCheck, Bot, MessageSquare, Users, LayoutGrid, TrendingUp, Zap, RotateCcw, User as UserIcon } from 'lucide-react';
import { useProfessionalPreferences } from '@/hooks/useProfessionalPreferences';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

/**
 * Per-user override of business settings. Each professional can customize
 * their own working hours, agenda preferences and automation toggles.
 * Fields left untouched (null) inherit from the account's global settings.
 */
export function MinhasPreferenciasSettings() {
  const { prefs, effective, update, resetField } = useProfessionalPreferences();
  const { settings: global } = useBusinessSettings();

  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [slot, setSlot] = useState<number | ''>('');
  const [workSat, setWorkSat] = useState<boolean | null>(null);
  const [workSun, setWorkSun] = useState<boolean | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Inicializa UMA VEZ ao carregar prefs. Refetches subsequentes (realtime/
  // cross-device) não devem sobrescrever edições em andamento do usuário —
  // após salvar, a UI já reflete os novos valores; após "Voltar ao padrão",
  // re-sincroniza explicitamente.
  useEffect(() => {
    if (prefs && !initialized) {
      setOpening(prefs.opening_time?.substring(0, 5) ?? '');
      setClosing(prefs.closing_time?.substring(0, 5) ?? '');
      setSlot(prefs.slot_interval ?? '');
      setWorkSat(prefs.work_saturdays);
      setWorkSun(prefs.work_sundays);
      setInitialized(true);
    }
  }, [prefs, initialized]);

  // Detecta alterações pendentes (campos editados que ainda não foram salvos)
  const isDirty = (() => {
    if (!prefs) return !!(opening || closing || slot !== '' || workSat !== null || workSun !== null);
    const o = prefs.opening_time?.substring(0, 5) ?? '';
    const c = prefs.closing_time?.substring(0, 5) ?? '';
    const s = prefs.slot_interval ?? '';
    return (
      opening !== o ||
      closing !== c ||
      String(slot) !== String(s) ||
      workSat !== prefs.work_saturdays ||
      workSun !== prefs.work_sundays
    );
  })();

  const saveHours = () => {
    update.mutate(
      {
        opening_time: opening ? `${opening}:00` : null,
        closing_time: closing ? `${closing}:00` : null,
        slot_interval: slot === '' ? null : Number(slot),
        work_saturdays: workSat,
        work_sundays: workSun,
      },
      { onSuccess: () => setLastSavedAt(new Date()) }
    );
  };

  const automations = [
    { key: 'automation_whatsapp_reminders', icon: MessageSquare, title: 'Lembretes WhatsApp', desc: 'Enviar lembretes automáticos aos seus clientes' },
    { key: 'automation_waitlist',           icon: Users,         title: 'Lista de espera',     desc: 'Notificar quando um horário seu abrir' },
    { key: 'automation_gap_finder',         icon: Zap,           title: 'Modo encaixe',        desc: 'Identificar brechas na sua agenda' },
    { key: 'automation_occupancy_dashboard',icon: LayoutGrid,    title: 'Ocupação',            desc: 'Mostrar sua taxa de ocupação' },
    { key: 'automation_smart_recurrence',   icon: TrendingUp,    title: 'Recorrência',         desc: 'Sugerir reagendamentos baseado em histórico' },
  ] as const;

  const inheritedBadge = (overrideValue: unknown) =>
    overrideValue === null || overrideValue === undefined
      ? <Badge variant="outline" className="h-4 text-[9px] px-1">herdado</Badge>
      : <Badge className="h-4 text-[9px] px-1">personalizado</Badge>;

  return (
    <Card className="card-hover border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><UserIcon className="h-4 w-4 text-primary" /></div>
          <div>
            <CardTitle className="text-sm font-medium">Minhas configurações</CardTitle>
            <CardDescription className="text-xs">
              Personalize horários, agenda e automações só para você. Campos em branco herdam do padrão da conta.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Horário pessoal */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-semibold">Meu horário de funcionamento</h3>
            {inheritedBadge(prefs?.opening_time ?? prefs?.closing_time)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Abertura</Label>
              <Input type="time" className="h-8 text-sm" value={opening} onChange={e => setOpening(e.target.value)} placeholder={global?.opening_time} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Fechamento</Label>
              <Input type="time" className="h-8 text-sm" value={closing} onChange={e => setClosing(e.target.value)} placeholder={global?.closing_time} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Intervalo (min)</Label>
              <Input type="number" className="h-8 text-sm" value={slot} min={15} max={120} step={15}
                onChange={e => setSlot(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={String(global?.slot_interval ?? 30)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-[11px]">Atendo sábados</Label>
              <Switch checked={workSat ?? global?.work_saturdays ?? false} onCheckedChange={v => setWorkSat(v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-[11px]">Atendo domingos</Label>
              <Switch checked={workSun ?? global?.work_sundays ?? false} onCheckedChange={v => setWorkSun(v)} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8" onClick={saveHours} disabled={update.isPending || !isDirty}>
              {update.isPending ? 'Salvando…' : isDirty ? 'Salvar meus horários' : 'Salvo'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1"
              onClick={() => {
                setOpening(''); setClosing(''); setSlot(''); setWorkSat(null); setWorkSun(null);
                update.mutate(
                  {
                    opening_time: null, closing_time: null, slot_interval: null,
                    work_saturdays: null, work_sundays: null,
                  },
                  { onSuccess: () => setLastSavedAt(new Date()) }
                );
              }}>
              <RotateCcw className="h-3 w-3" /> Voltar ao padrão da conta
            </Button>
            {isDirty && !update.isPending && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-amber-400 text-amber-700 bg-amber-50">
                Alterações não salvas
              </Badge>
            )}
            {!isDirty && lastSavedAt && !update.isPending && (
              <span className="text-[10px] text-emerald-700">
                ✓ Salvo às {lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {effective && (
            <p className="text-[10px] text-muted-foreground">
              Vai valer para mim: <strong>{effective.opening_time}–{effective.closing_time}</strong> · intervalo {effective.slot_interval}min
            </p>
          )}
        </section>

        {/* Prefs de agenda */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-semibold">Minhas preferências da agenda</h3>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-[11px]">Arrastar e soltar</Label>
              <p className="text-[10px] text-muted-foreground">Mover agendamentos arrastando</p>
            </div>
            <Switch
              checked={prefs?.drag_and_drop_enabled ?? effective?.drag_and_drop_enabled ?? true}
              onCheckedChange={(v) => update.mutate({ drag_and_drop_enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-[11px] flex items-center gap-1.5">
                <CalendarCheck className="h-3 w-3" />
                Autocompletar agendamentos
              </Label>
              <p className="text-[10px] text-muted-foreground">Marcar como "Atendido" automaticamente</p>
            </div>
            <Switch
              checked={prefs?.auto_complete_appointments ?? effective?.auto_complete_appointments ?? false}
              onCheckedChange={(v) => update.mutate({ auto_complete_appointments: v })}
            />
          </div>
        </section>

        {/* Automações */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-semibold">Minhas automações</h3>
          </div>
          {automations.map(({ key, icon: Icon, title, desc }) => {
            const override = prefs?.[key] ?? null;
            const value = override ?? (effective?.[key] as boolean) ?? true;
            return (
              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                  <div>
                    <Label className="text-[11px] font-medium">{title}</Label>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {inheritedBadge(override)}
                  <Switch checked={value} onCheckedChange={(v) => update.mutate({ [key]: v } as never)} />
                  {override !== null && override !== undefined && (
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => resetField(key)}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </CardContent>
    </Card>
  );
}
