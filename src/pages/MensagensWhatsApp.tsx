import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Send, Check, RotateCcw, Search, Cake, Bell, CheckCheck, Clock } from 'lucide-react';
import { useAppointments } from '@/hooks/useAppointments';
import { useClients } from '@/hooks/useClients';
import { useWhatsappTemplates } from '@/hooks/useWhatsappTemplates';
import {
  OutboxItem,
  OutboxType,
  getSentRecords,
  isSent,
  markSent,
  unmarkSent,
  openWhatsappShare,
  renderTemplate,
  formatAppointmentDate,
  formatAppointmentTime,
} from '@/lib/whatsappOutbox';
import { toast } from 'sonner';

const TYPE_LABEL: Record<OutboxType, string> = {
  reminder: 'Lembrete',
  confirmation: 'Confirmação',
  follow_up: 'Pós-atendimento',
  birthday: 'Aniversário',
};

const TYPE_ICON: Record<OutboxType, React.ComponentType<{ className?: string }>> = {
  reminder: Bell,
  confirmation: CheckCheck,
  follow_up: Clock,
  birthday: Cake,
};

export default function MensagensWhatsApp() {
  const { appointments } = useAppointments();
  const { clients } = useClients();
  const { templates } = useWhatsappTemplates();
  const [search, setSearch] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const sentKeys = useMemo(() => {
    void refreshTick;
    return new Set(getSentRecords().map(r => r.key));
  }, [refreshTick]);

  const items = useMemo<OutboxItem[]>(() => {
    const now = new Date();
    const out: OutboxItem[] = [];

    const activeTemplates = templates.filter(t => t.is_active);

    for (const tmpl of activeTemplates) {
      if (tmpl.type === 'birthday') {
        const todayKey = `${now.getMonth() + 1}-${now.getDate()}`;
        for (const c of clients) {
          if (!c.birthdate) continue;
          const bd = new Date(c.birthdate + 'T12:00:00');
          const bKey = `${bd.getMonth() + 1}-${bd.getDate()}`;
          if (bKey !== todayKey) continue;
          const key = `birthday:${tmpl.id}:${c.id}:${now.toISOString().slice(0, 10)}`;
          const message = renderTemplate(tmpl.message, { cliente: c.name });
          out.push({
            key,
            type: 'birthday',
            templateId: tmpl.id,
            templateName: tmpl.name,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            message,
            scheduledFor: now,
          });
        }
        continue;
      }

      // Appointment-based templates
      for (const apt of appointments) {
        if (!apt.client) continue;
        if (tmpl.professional_id && apt.professional_id !== tmpl.professional_id) continue;

        const start = new Date(apt.start_time);
        const end = new Date(apt.end_time);

        const vars = {
          cliente: apt.client.name,
          data: formatAppointmentDate(apt.start_time),
          horario: formatAppointmentTime(apt.start_time),
          servico: apt.service?.name ?? '',
          profissional: (apt.service as any)?.professional?.name ?? '',
        };
        const message = renderTemplate(tmpl.message, vars);

        if (tmpl.type === 'reminder') {
          if (apt.status === 'cancelled' || apt.status === 'missed' || apt.status === 'rescheduled' || apt.status === 'completed') continue;
          const hoursBefore = tmpl.hours_before ?? 24;
          const windowStart = new Date(start.getTime() - hoursBefore * 60 * 60 * 1000);
          if (now < windowStart || now > start) continue;
          out.push({
            key: `reminder:${tmpl.id}:${apt.id}`,
            type: 'reminder',
            templateId: tmpl.id,
            templateName: tmpl.name,
            clientId: apt.client.id,
            clientName: apt.client.name,
            clientPhone: apt.client.phone,
            message,
            scheduledFor: windowStart,
            appointmentId: apt.id,
            serviceName: vars.servico,
            professionalName: vars.profissional,
          });
        } else if (tmpl.type === 'confirmation') {
          if (apt.status !== 'scheduled') continue;
          if (start < now) continue;
          out.push({
            key: `confirmation:${tmpl.id}:${apt.id}`,
            type: 'confirmation',
            templateId: tmpl.id,
            templateName: tmpl.name,
            clientId: apt.client.id,
            clientName: apt.client.name,
            clientPhone: apt.client.phone,
            message,
            scheduledFor: new Date(apt.created_at ?? now.toISOString()),
            appointmentId: apt.id,
            serviceName: vars.servico,
            professionalName: vars.profissional,
          });
        } else if (tmpl.type === 'follow_up') {
          if (apt.status !== 'completed') continue;
          const offset = tmpl.send_offset_hours ?? 2;
          const trigger = new Date(end.getTime() + offset * 60 * 60 * 1000);
          // Only show items whose trigger time has arrived but within last 7 days
          if (now < trigger) continue;
          if (now.getTime() - trigger.getTime() > 7 * 24 * 60 * 60 * 1000) continue;
          out.push({
            key: `follow_up:${tmpl.id}:${apt.id}`,
            type: 'follow_up',
            templateId: tmpl.id,
            templateName: tmpl.name,
            clientId: apt.client.id,
            clientName: apt.client.name,
            clientPhone: apt.client.phone,
            message,
            scheduledFor: trigger,
            appointmentId: apt.id,
            serviceName: vars.servico,
            professionalName: vars.profissional,
          });
        }
      }
    }

    return out.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  }, [appointments, clients, templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.clientName.toLowerCase().includes(q) ||
      i.templateName.toLowerCase().includes(q) ||
      (i.serviceName ?? '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const pending = filtered.filter(i => !sentKeys.has(i.key));
  const done = filtered.filter(i => sentKeys.has(i.key));

  const handleSend = (item: OutboxItem) => {
    if (!item.clientPhone) {
      toast.warning('Cliente sem telefone — abrindo WhatsApp para escolher contato.');
    }
    openWhatsappShare(item.clientPhone, item.message);
    markSent(item.key);
    setRefreshTick(t => t + 1);
  };

  const handleUndo = (item: OutboxItem) => {
    unmarkSent(item.key);
    setRefreshTick(t => t + 1);
  };

  const renderItem = (item: OutboxItem, sent: boolean) => {
    const Icon = TYPE_ICON[item.type];
    return (
      <Card key={item.key} className="card-hover">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.clientName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.templateName}
                  {item.serviceName ? ` • ${item.serviceName}` : ''}
                  {item.professionalName ? ` • ${item.professionalName}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[item.type]}</Badge>
              {item.clientPhone ? (
                <Badge variant="secondary" className="text-[10px] tabular-nums">{item.clientPhone}</Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">Sem telefone</Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 border-l-2 border-muted pl-2">
            {item.message}
          </p>
          <div className="flex justify-end gap-2">
            {sent ? (
              <Button size="sm" variant="ghost" onClick={() => handleUndo(item)} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={sent ? 'outline' : 'default'}
              onClick={() => handleSend(item)}
              className="gap-1.5"
            >
              {sent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {sent ? 'Enviar novamente' : 'Compartilhar no WhatsApp'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout
      title="Mensagens WhatsApp"
      subtitle="Envie lembretes, confirmações, pós-atendimento e aniversário direto do seu WhatsApp"
    >
      <PageTransition>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">Fila de envios</CardTitle>
                  <CardDescription className="text-xs">
                    As mensagens são montadas automaticamente conforme cada template (horas antes/depois do agendamento).
                    Clique em <strong>Compartilhar no WhatsApp</strong> para abrir o app já com o cliente e o texto prontos.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, template ou serviço…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-9 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="pending" className="space-y-3">
            <TabsList className="h-8">
              <TabsTrigger value="pending" className="text-xs px-3 gap-1.5">
                Pendentes
                <Badge variant="secondary" className="h-4 text-[10px]">{pending.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sent" className="text-xs px-3 gap-1.5">
                Enviadas
                <Badge variant="secondary" className="h-4 text-[10px]">{done.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-2">
              {pending.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem pendente no momento.
                </CardContent></Card>
              ) : pending.map(i => renderItem(i, false))}
            </TabsContent>

            <TabsContent value="sent" className="space-y-2">
              {done.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem marcada como enviada ainda.
                </CardContent></Card>
              ) : done.map(i => renderItem(i, true))}
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
