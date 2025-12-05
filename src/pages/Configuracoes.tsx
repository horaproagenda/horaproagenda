import { Building2, Clock, Bell, Palette } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const Configuracoes = () => {
  return (
    <AppLayout 
      title="Configurações" 
      subtitle="Personalize seu sistema"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Business Info */}
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
                <CardDescription>Configure os horários disponíveis</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Abertura</Label>
                <Input type="time" defaultValue="08:00" />
              </div>
              <div className="space-y-2">
                <Label>Fechamento</Label>
                <Input type="time" defaultValue="20:00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre agendamentos</Label>
              <Input type="number" defaultValue="30" />
              <p className="text-xs text-muted-foreground">Tempo em minutos</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Trabalhar aos sábados</Label>
                <p className="text-xs text-muted-foreground">Habilitar agendamentos no sábado</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Button className="w-full">Salvar Horários</Button>
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

        {/* Appearance */}
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
    </AppLayout>
  );
};

export default Configuracoes;
