import { useState, useEffect } from 'react';
import { Building2, Clock, Bell, Palette, GripVertical, CalendarCheck, Globe, DollarSign, Check } from 'lucide-react';
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
import ReminderConfigSettings from '@/components/settings/ReminderConfigSettings';
import { ProfessionalQuietHours } from '@/components/settings/ProfessionalQuietHours';
import { StockAlertSettings } from '@/components/settings/StockAlertSettings';
import { SystemHealthPanel } from '@/components/settings/SystemHealthPanel';

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
  const [overdueDaysThreshold, setOverdueDaysThreshold] = useState(0);

  // Clinic info
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');

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
      setOverdueDaysThreshold(settings.overdue_days_threshold ?? 0);
      setClinicName((settings as any).clinic_name || '');
      setClinicPhone((settings as any).clinic_phone || '');
      setClinicEmail((settings as any).clinic_email || '');
      setClinicAddress((settings as any).clinic_address || '');
    }
  }, [settings]);

  const handleSaveClinic = () => {
    updateSettings.mutate({
      clinic_name: clinicName,
      clinic_phone: clinicPhone,
      clinic_email: clinicEmail,
      clinic_address: clinicAddress,
    } as any);
  };

  const handleSaveHours = () => {
    updateSettings.mutate({
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
    });
  };

  return (
    <AppLayout title="Configurações" subtitle="Personalize seu sistema">
      <PageTransition>
        <div className="mx-auto w-full max-w-4xl space-y-4 text-xs settings-page">
          {/* Gestão de usuários movida para o Painel do Administrador (/admin) */}

          {/* Diagnóstico do Sistema (saúde + auto-reparo) */}
          <SystemHealthPanel />

          {/* WhatsApp Connection Status */}
          <WhatsappSettings />

          {/* WhatsApp Templates */}
          <WhatsappTemplatesSettings />

          {/* Automation Settings */}
          <AutomationSettings />

          {/* Reminder Configuration */}
          <ReminderConfigSettings />

          {/* Stock Alert Settings */}
          <StockAlertSettings />

          {/* Financial Settings */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Configurações Financeiras</CardTitle>
                  <CardDescription className="text-xs">Regras de atraso e contas a pagar</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm">Dias de tolerância para marcar como atrasada</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Quantos dias após o vencimento uma conta é marcada como "Atrasada". 0 = no dia do vencimento.
                </p>
                <Input
                  type="number"
                  min="0"
                  max="90"
                  value={overdueDaysThreshold}
                  onChange={(e) => setOverdueDaysThreshold(parseInt(e.target.value) || 0)}
                  className="w-24"
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  updateSettings.mutate({ overdue_days_threshold: overdueDaysThreshold } as any);
                }}
              >
                Salvar
              </Button>
            </CardContent>
          </Card>

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
                    className="h-8 text-sm"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Nome do estabelecimento"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      className="h-8 text-sm"
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                      className="h-8 text-sm"
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="contato@clinica.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endereço</Label>
                  <Input
                    className="h-8 text-sm"
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Rua, número - Cidade, UF"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full btn-vibrant"
                  onClick={handleSaveClinic}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? 'Salvando...' : 'Salvar Alterações'}
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
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-8 text-sm">
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
                      className="h-8 text-sm"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fechamento</Label>
                    <Input 
                      type="time" 
                      className="h-8 text-sm"
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo entre agendamentos (min)</Label>
                  <Input 
                    type="number" 
                    className="h-8 text-sm"
                    value={slotInterval}
                    onChange={(e) => setSlotInterval(Number(e.target.value))}
                    min={15}
                    max={120}
                    step={15}
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Trabalhar aos sábados</Label>
                  <Switch checked={workSaturdays} onCheckedChange={setWorkSaturdays} />
                </div>
                {workSaturdays && (
                  <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Abertura (Sáb)</Label>
                      <Input 
                        type="time" 
                        className="h-8 text-sm"
                        value={saturdayOpeningTime}
                        onChange={(e) => setSaturdayOpeningTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fechamento (Sáb)</Label>
                      <Input 
                        type="time" 
                        className="h-8 text-sm"
                        value={saturdayClosingTime}
                        onChange={(e) => setSaturdayClosingTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Trabalhar aos domingos</Label>
                  <Switch checked={workSundays} onCheckedChange={setWorkSundays} />
                </div>
                {workSundays && (
                  <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Abertura (Dom)</Label>
                      <Input 
                        type="time" 
                        className="h-8 text-sm"
                        value={sundayOpeningTime}
                        onChange={(e) => setSundayOpeningTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fechamento (Dom)</Label>
                      <Input 
                        type="time" 
                        className="h-8 text-sm"
                        value={sundayClosingTime}
                        onChange={(e) => setSundayClosingTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <Button 
                  size="sm"
                  className="w-full btn-vibrant" 
                  onClick={handleSaveHours}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? 'Salvando...' : 'Salvar Horários'}
                </Button>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Bell className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Notificações</CardTitle>
                    <CardDescription className="text-xs">Configure lembretes e alertas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label className="text-xs">Lembrete por email</Label>
                    <p className="text-[10px] text-muted-foreground">Enviar email para clientes</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label className="text-xs">Lembrete por SMS</Label>
                    <p className="text-[10px] text-muted-foreground">Enviar SMS para clientes</p>
                  </div>
                  <Switch />
                </div>
                <p className="text-[10px] text-muted-foreground pt-2">
                  Configure os templates e horários de envio do WhatsApp em{' '}
                  <strong>Templates de WhatsApp</strong> acima.
                </p>
              </CardContent>
            </Card>

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
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Configuracoes;
