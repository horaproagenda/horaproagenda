import { useState, useEffect } from 'react';
import { Building2, Clock, Bell, Palette, GripVertical, CalendarCheck } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { toast } from 'sonner';
import UserManagement from '@/components/settings/UserManagement';

const Configuracoes = () => {
  const { settings, updateSettings, isLoading } = useBusinessSettings();
  
  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingTime, setClosingTime] = useState('20:00');
  const [slotInterval, setSlotInterval] = useState(30);
  const [workSaturdays, setWorkSaturdays] = useState(true);
  const [workSundays, setWorkSundays] = useState(false);
  const [dragAndDropEnabled, setDragAndDropEnabled] = useState(true);
  const [autoCompleteAppointments, setAutoCompleteAppointments] = useState(false);

  useEffect(() => {
    if (settings) {
      setOpeningTime(settings.opening_time || '08:00');
      setClosingTime(settings.closing_time || '20:00');
      setSlotInterval(settings.slot_interval || 30);
      setWorkSaturdays(settings.work_saturdays ?? true);
      setWorkSundays(settings.work_sundays ?? false);
      setDragAndDropEnabled(settings.drag_and_drop_enabled ?? true);
      setAutoCompleteAppointments(settings.auto_complete_appointments ?? false);
    }
  }, [settings]);

  const handleSaveHours = () => {
    updateSettings.mutate({
      opening_time: openingTime,
      closing_time: closingTime,
      slot_interval: slotInterval,
      work_saturdays: workSaturdays,
      work_sundays: workSundays,
    });
  };


  return (
    <AppLayout 
      title="Configurações" 
      subtitle="Personalize seu sistema"
    >
      <div className="space-y-6">
        {/* User Management */}
        <UserManagement />

        <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Informações da Clínica</CardTitle>
                <CardDescription>Dados básicos do estabelecimento</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinic-name">Nome da Clínica</Label>
              <Input id="clinic-name" defaultValue="Belezza Estética & Bem-estar" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-phone">Telefone</Label>
              <Input id="clinic-phone" defaultValue="(11) 99999-9999" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-email">Email</Label>
              <Input id="clinic-email" type="email" defaultValue="contato@belezza.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-address">Endereço</Label>
              <Input id="clinic-address" defaultValue="Av. Paulista, 1234 - São Paulo, SP" />
            </div>
            <Button className="w-full">Salvar Alterações</Button>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Horário de Funcionamento</CardTitle>
                <CardDescription>Configure os horários disponíveis na agenda</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Abertura</Label>
                <Input 
                  type="time" 
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fechamento</Label>
                <Input 
                  type="time" 
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre agendamentos</Label>
              <Input 
                type="number" 
                value={slotInterval}
                onChange={(e) => setSlotInterval(Number(e.target.value))}
                min={15}
                max={120}
                step={15}
              />
              <p className="text-xs text-muted-foreground">Tempo em minutos (15, 30, 45, 60...)</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Trabalhar aos sábados</Label>
                <p className="text-xs text-muted-foreground">Habilitar agendamentos no sábado</p>
              </div>
              <Switch 
                checked={workSaturdays} 
                onCheckedChange={setWorkSaturdays}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Trabalhar aos domingos</Label>
                <p className="text-xs text-muted-foreground">Habilitar agendamentos no domingo</p>
              </div>
              <Switch 
                checked={workSundays} 
                onCheckedChange={setWorkSundays}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleSaveHours}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? 'Salvando...' : 'Salvar Horários'}
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Notificações</CardTitle>
                <CardDescription>Configure lembretes e alertas</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Lembrete por email</Label>
                <p className="text-xs text-muted-foreground">Enviar email para clientes</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Lembrete por SMS</Label>
                <p className="text-xs text-muted-foreground">Enviar SMS para clientes</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>WhatsApp</Label>
                <p className="text-xs text-muted-foreground">Enviar mensagem pelo WhatsApp</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="space-y-2">
              <Label>Antecedência do lembrete</Label>
              <Input type="number" defaultValue="24" />
              <p className="text-xs text-muted-foreground">Horas antes do agendamento</p>
            </div>
          </CardContent>
        </Card>

        {/* Agenda Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <GripVertical className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Agenda</CardTitle>
                <CardDescription>Configure opções da agenda</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Arrastar e soltar</Label>
                <p className="text-xs text-muted-foreground">Permitir mover agendamentos arrastando na agenda</p>
              </div>
              <Switch 
                checked={dragAndDropEnabled} 
                onCheckedChange={(checked) => {
                  setDragAndDropEnabled(checked);
                  updateSettings.mutate({ drag_and_drop_enabled: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" />
                  Auto-completar agendamentos
                </Label>
                <p className="text-xs text-muted-foreground">Mudar automaticamente para "Atendido" após o horário passar</p>
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

        {/* Appearance */}
        {/* Business Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Aparência</CardTitle>
                <CardDescription>Personalize a interface</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cor Principal</Label>
              <div className="flex gap-2">
                {['#D4A5AC', '#E8B4BC', '#C9A86C', '#A8C9A7', '#B8A9C9'].map(color => (
                  <button
                    key={color}
                    className="h-8 w-8 rounded-full border-2 border-border transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Modo escuro</Label>
                <p className="text-xs text-muted-foreground">Tema dark para a interface</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Animações</Label>
                <p className="text-xs text-muted-foreground">Efeitos visuais na interface</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
