import { useState, useEffect } from 'react';
import { Building2, Clock, Palette, GripVertical, CalendarCheck, Globe, Check, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusinessSettings, BRAZIL_TIMEZONES } from '@/hooks/useBusinessSettings';
import { useAppearanceSettings, PRIMARY_COLOR_PALETTE } from '@/hooks/useAppearanceSettings';
import { toast } from 'sonner';

import { WhatsappTemplatesSettings } from '@/components/settings/WhatsappTemplatesSettings';
import { WhatsappSettings } from '@/components/settings/WhatsappSettings';
import { BulkDeleteDialog } from '@/components/settings/BulkDeleteDialog';
import AutomationSettings from '@/components/settings/AutomationSettings';
import { DeleteMyAccountDialog } from '@/components/settings/DeleteMyAccountDialog';

const Configuracoes = () => {
  const { settings, updateSettings, isLoading } = useBusinessSettings();
  const { settings: appearance, updateSettings: updateAppearance } = useAppearanceSettings();
  
  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingTime, setClosingTime] = useState('20:00');
  const [slotInterval, setSlotInterval] = useState(30);
  const [workSaturdays, setWorkSaturdays] = useState(true);
  const [workSundays, setWorkSundays] = useState(false);
  const [saturdayOpeningTime, setSaturdayOpeningTime] = useState('08:00');
  const [saturdayClosingTime, setSaturdayClosingTime] = useState('18:00');
  const [sundayOpeningTime, setSundayOpeningTime] = useState('08:00');
  const [sundayClosingTime, setSundayClosingTime] = useState('18:00');
  const [dragAndDropEnabled, setDragAndDropEnabled] = useState(true);
  const [autoCompleteAppointments, setAutoCompleteAppointments] = useState(false);
  const [timezone, setTimezone] = useState('America/Sao_Paulo');

  // Clinic info
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');

  // Edit-mode toggles (after first save, fields lock & button switches to "Editar")
  const [clinicEditing, setClinicEditing] = useState(false);
  const [hoursEditing, setHoursEditing] = useState(false);

  const clinicSaved = !!((settings as any)?.clinic_name);
  const hoursSaved = !!settings?.id;
  const clinicLocked = clinicSaved && !clinicEditing;
  const hoursLocked = hoursSaved && !hoursEditing;
  const savedInputClass =
    'h-8 text-sm border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium';

  useEffect(() => {
    if (settings) {
      setOpeningTime(settings.opening_time || '08:00');
      setClosingTime(settings.closing_time || '20:00');
      setSlotInterval(settings.slot_interval || 30);
      setWorkSaturdays(settings.work_saturdays ?? true);
      setWorkSundays(settings.work_sundays ?? false);
      setSaturdayOpeningTime(settings.saturday_opening_time || '08:00');
      setSaturdayClosingTime(settings.saturday_closing_time || '18:00');
      setSundayOpeningTime(settings.sunday_opening_time || '08:00');
      setSundayClosingTime(settings.sunday_closing_time || '18:00');
      setDragAndDropEnabled(settings.drag_and_drop_enabled ?? true);
      setAutoCompleteAppointments(settings.auto_complete_appointments ?? false);
      setTimezone(settings.timezone || 'America/Sao_Paulo');
      setClinicName((settings as any).clinic_name || '');
      setClinicPhone((settings as any).clinic_phone || '');
      setClinicEmail((settings as any).clinic_email || '');
      setClinicAddress((settings as any).clinic_address || '');
    }
  }, [settings]);

  const handleSaveClinic = () => {
    if (clinicLocked) {
      setClinicEditing(true);
      return;
    }
    updateSettings.mutate(
      {
        clinic_name: clinicName,
        clinic_phone: clinicPhone,
        clinic_email: clinicEmail,
        clinic_address: clinicAddress,
      } as any,
      { onSuccess: () => setClinicEditing(false) }
    );
  };

  const handleSaveHours = () => {
    if (hoursLocked) {
      setHoursEditing(true);
      return;
    }
    updateSettings.mutate(
      {
        opening_time: openingTime,
        closing_time: closingTime,
        slot_interval: slotInterval,
        work_saturdays: workSaturdays,
        work_sundays: workSundays,
        saturday_opening_time: saturdayOpeningTime,
        saturday_closing_time: saturdayClosingTime,
        sunday_opening_time: sundayOpeningTime,
        sunday_closing_time: sundayClosingTime,
        timezone: timezone,
      },
      { onSuccess: () => setHoursEditing(false) }
    );
  };

  return (
    <AppLayout title="Configurações" subtitle="Personalize seu sistema">
      <PageTransition>
        <div className="mx-auto w-full max-w-4xl space-y-4 text-xs settings-page">
          {/* Gestão de usuários movida para o Painel do Administrador (/admin) */}
          {/* Diagnóstico do sistema e integridade da agenda/pacotes rodam automaticamente em background (useAgendaIntegrityAutoCheck + usePostUpdateDataHeal). */}

          {/* 1. Informações da Clínica + Horários */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Informações da Clínica</CardTitle>
                    <CardDescription className="text-xs">Dados básicos do estabelecimento</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome da Clínica</Label>
                  <Input
                    className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Nome do estabelecimento"
                    readOnly={clinicLocked}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      readOnly={clinicLocked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                      className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="contato@clinica.com"
                      readOnly={clinicLocked}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endereço</Label>
                  <Input
                    className={clinicLocked ? savedInputClass : 'h-8 text-sm'}
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Rua, número - Cidade, UF"
                    readOnly={clinicLocked}
                  />
                </div>
                <Button
                  size="sm"
                  variant={clinicLocked ? 'outline' : 'default'}
                  className={clinicLocked ? 'w-full' : 'w-full btn-vibrant'}
                  onClick={handleSaveClinic}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending
                    ? 'Salvando...'
                    : clinicLocked
                    ? 'Editar Informações'
                    : clinicSaved
                    ? 'Salvar Alterações'
                    : 'Salvar Informações'}
                </Button>
              </CardContent>

            </Card>

            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Horário de Funcionamento</CardTitle>
                    <CardDescription className="text-xs">Configure os horários da agenda</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Globe className="h-3 w-3" />
                    Fuso Horário
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone} disabled={hoursLocked}>
                    <SelectTrigger className={hoursLocked ? savedInputClass : 'h-8 text-sm'}>
                      <SelectValue placeholder="Selecione o fuso horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZIL_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          <div className="flex flex-col">
                            <span>{tz.label}</span>
                            <span className="text-[10px] text-muted-foreground">{tz.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Abertura</Label>
                    <Input
                      type="time"
                      className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      readOnly={hoursLocked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fechamento</Label>
                    <Input
                      type="time"
                      className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                      readOnly={hoursLocked}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo entre agendamentos (min)</Label>
                  <Input
                    type="number"
                    className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                    value={slotInterval}
                    onChange={(e) => setSlotInterval(Number(e.target.value))}
                    min={15}
                    max={120}
                    step={15}
                    readOnly={hoursLocked}
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Trabalhar aos sábados</Label>
                  <Switch checked={workSaturdays} onCheckedChange={setWorkSaturdays} disabled={hoursLocked} />
                </div>
                {workSaturdays && (
                  <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Abertura (Sáb)</Label>
                      <Input
                        type="time"
                        className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                        value={saturdayOpeningTime}
                        onChange={(e) => setSaturdayOpeningTime(e.target.value)}
                        readOnly={hoursLocked}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fechamento (Sáb)</Label>
                      <Input
                        type="time"
                        className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                        value={saturdayClosingTime}
                        onChange={(e) => setSaturdayClosingTime(e.target.value)}
                        readOnly={hoursLocked}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Trabalhar aos domingos</Label>
                  <Switch checked={workSundays} onCheckedChange={setWorkSundays} disabled={hoursLocked} />
                </div>
                {workSundays && (
                  <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Abertura (Dom)</Label>
                      <Input
                        type="time"
                        className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                        value={sundayOpeningTime}
                        onChange={(e) => setSundayOpeningTime(e.target.value)}
                        readOnly={hoursLocked}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fechamento (Dom)</Label>
                      <Input
                        type="time"
                        className={hoursLocked ? savedInputClass : 'h-8 text-sm'}
                        value={sundayClosingTime}
                        onChange={(e) => setSundayClosingTime(e.target.value)}
                        readOnly={hoursLocked}
                      />
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant={hoursLocked ? 'outline' : 'default'}
                  className={hoursLocked ? 'w-full' : 'w-full btn-vibrant'}
                  onClick={handleSaveHours}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending
                    ? 'Salvando...'
                    : hoursLocked
                    ? 'Editar Horários'
                    : hoursSaved
                    ? 'Salvar Alterações'
                    : 'Salvar Horários'}
                </Button>
              </CardContent>

            </Card>
          </div>

          {/* 2. Conexão com o WhatsApp */}
          <WhatsappSettings />

          {/* 3. Mensagens de WhatsApp */}
          <WhatsappTemplatesSettings />

          {/* Automações + Agenda + Aparência */}
          <AutomationSettings />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <GripVertical className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Agenda</CardTitle>
                    <CardDescription className="text-xs">Configure opções da agenda</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label className="text-xs">Arrastar e soltar</Label>
                    <p className="text-[10px] text-muted-foreground">Mover agendamentos arrastando</p>
                  </div>
                  <Switch
                    checked={dragAndDropEnabled}
                    onCheckedChange={(checked) => {
                      setDragAndDropEnabled(checked);
                      updateSettings.mutate({ drag_and_drop_enabled: checked });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label className="text-xs flex items-center gap-1.5">
                      <CalendarCheck className="h-3 w-3" />
                      Auto-completar agendamentos
                    </Label>
                    <p className="text-[10px] text-muted-foreground">Mudar automaticamente para "Atendido"</p>
                  </div>
                  <Switch
                    checked={autoCompleteAppointments}
                    onCheckedChange={(checked) => {
                      setAutoCompleteAppointments(checked);
                      updateSettings.mutate({ auto_complete_appointments: checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Palette className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Aparência</CardTitle>
                    <CardDescription className="text-xs">Personalize a interface</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Cor Principal</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Escolha a cor que será aplicada em toda a agenda. A escolha é salva apenas para você.
                  </p>
                  <div className="grid grid-cols-8 gap-2 pt-1">
                    {PRIMARY_COLOR_PALETTE.map(color => {
                      const selected = appearance.primaryColor === color.hsl;
                      return (
                        <button
                          key={color.hsl}
                          type="button"
                          title={color.name}
                          aria-label={color.name}
                          onClick={() => {
                            updateAppearance({ primaryColor: color.hsl });
                            toast.success(`Cor principal: ${color.name}`);
                          }}
                          className={`relative h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
                            selected ? 'border-foreground ring-2 ring-foreground/30' : 'border-border'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        >
                          {selected && (
                            <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1 border-t pt-3">
                  <div>
                    <Label className="text-xs">Modo escuro</Label>
                    <p className="text-[10px] text-muted-foreground">Tema dark</p>
                  </div>
                  <Switch
                    checked={appearance.darkMode}
                    onCheckedChange={(checked) => {
                      updateAppearance({ darkMode: checked });
                      toast.success(checked ? 'Modo escuro ativado' : 'Modo claro ativado');
                    }}
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label className="text-xs">Animações</Label>
                    <p className="text-[10px] text-muted-foreground">Efeitos visuais e transições</p>
                  </div>
                  <Switch
                    checked={appearance.animations}
                    onCheckedChange={(checked) => {
                      updateAppearance({ animations: checked });
                      toast.success(checked ? 'Animações ativadas' : 'Animações desativadas');
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>


          {/* Bulk Delete */}
          <BulkDeleteDialog />

          {/* Sua Conta - Exclusão definitiva */}
          <Card className="card-hover border-destructive/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">Sua Conta</CardTitle>
                  <CardDescription className="text-xs">
                    Excluir permanentemente seu cadastro e todos os dados associados
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ao excluir sua conta, todos os clientes, agendamentos, pacotes, registros financeiros e
                configurações serão apagados de forma <strong>irreversível</strong>. Por questões de
                segurança, o e-mail, CPF, CNPJ e telefone usados ficarão bloqueados para reutilização
                do <strong>período gratuito de 7 dias</strong> por <strong>6 meses</strong> após a
                exclusão — para voltar antes desse prazo será necessário contratar um plano pago.
              </p>
              <div className="flex justify-end">
                <DeleteMyAccountDialog />
              </div>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Configuracoes;
