import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Edit2, Trash2, Save, X, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useWhatsappTemplates, WhatsappTemplate } from '@/hooks/useWhatsappTemplates';
import { useProfessionals } from '@/hooks/useProfessionals';
import { openWhatsappWithMessage, renderTemplate } from '@/lib/whatsappLink';
import { WhatsappPreviewDialog } from '@/components/shared/WhatsappPreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const templateTypes = [
  { value: 'reminder', label: 'Lembrete de Agendamento' },
  { value: 'birthday', label: 'Aniversário' },
  { value: 'confirmation', label: 'Confirmação' },
  { value: 'follow_up', label: 'Pós-atendimento' },
];

const variablesHelp = [
  { variable: '{cliente}', description: 'Nome completo do cliente' },
  { variable: '{primeiro_nome}', description: 'Apenas o primeiro nome' },
  { variable: '{data}', description: 'Data com ano (dd/mm/aaaa)' },
  { variable: '{data_sem_ano}', description: 'Data sem ano (dd/mm)' },
  { variable: '{data_extenso}', description: 'Data por extenso com ano' },
  { variable: '{data_extenso_sem_ano}', description: 'Data por extenso sem ano' },
  { variable: '{horario}', description: 'Horário do agendamento' },
  { variable: '{servico}', description: 'Nome do serviço' },
  { variable: '{profissional}', description: 'Nome do profissional' },
  { variable: '{link_confirmar}', description: 'Link para o cliente confirmar' },
  { variable: '{link_cancelar}', description: 'Link para o cliente cancelar' },
];

const MAX_TEMPLATES_PER_PROFESSIONAL = 4;

type FormState = {
  name: string;
  type: WhatsappTemplate['type'];
  message: string;
  hours_before: number;
  send_offset_hours: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  professional_id: string;
  is_active: boolean;
  include_confirmation_buttons: boolean;
};

const initialForm: FormState = {
  name: '',
  type: 'reminder',
  message: '',
  hours_before: 24,
  send_offset_hours: 9,
  quiet_hours_start: 8,
  quiet_hours_end: 20,
  professional_id: '',
  is_active: true,
  include_confirmation_buttons: false,
};

export function WhatsappTemplatesSettings() {
  const { templates: allTemplates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useWhatsappTemplates();
  const { professionals } = useProfessionals();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<FormState>(initialForm);

  // Current user context
  const [isStaff, setIsStaff] = useState(false); // admin or receptionist
  const [myProfessionalId, setMyProfessionalId] = useState<string | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [whatsappPreviewOpen, setWhatsappPreviewOpen] = useState(false);
  const [whatsappPreviewMessage, setWhatsappPreviewMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCtxLoaded(true); return; }
      const { data: rolesRows } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      const roles = (rolesRows ?? []).map((r: any) => r.role);
      setIsStaff(roles.includes('admin') || roles.includes('receptionist'));
      const { data: prof } = await supabase
        .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
      setMyProfessionalId(prof?.id ?? null);
      setCtxLoaded(true);
    })();
  }, []);

  // Non-staff professionals see only their own templates.
  const templates = useMemo(() => {
    if (isStaff) return allTemplates;
    if (!myProfessionalId) return [];
    return allTemplates.filter(t => t.professional_id === myProfessionalId);
  }, [allTemplates, isStaff, myProfessionalId]);

  const handleEdit = (template: WhatsappTemplate) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      type: template.type,
      message: template.message,
      hours_before: template.hours_before ?? 24,
      send_offset_hours: template.send_offset_hours ?? (template.type === 'birthday' ? 9 : 2),
      quiet_hours_start: template.quiet_hours_start ?? 8,
      quiet_hours_end: template.quiet_hours_end ?? 20,
      professional_id: template.professional_id ?? '',
      is_active: template.is_active,
    });
  };

  const countForProfessional = (profId: string | null, exceptId?: string) =>
    templates.filter(t => (t.professional_id ?? null) === (profId ?? null) && t.id !== exceptId).length;

  const handleSave = () => {
    // Non-staff professionals can only save templates tied to themselves.
    const targetProfId = isStaff
      ? (formData.professional_id || null)
      : myProfessionalId;
    if (!isStaff && !targetProfId) {
      toast.error('Seu usuário não está vinculado a um profissional. Contate o administrador.');
      return;
    }
    const existingCount = countForProfessional(targetProfId, editingId ?? undefined);
    if (existingCount >= MAX_TEMPLATES_PER_PROFESSIONAL) {
      toast.error(
        `Limite atingido: cada profissional pode ter no máximo ${MAX_TEMPLATES_PER_PROFESSIONAL} mensagens pré-definidas.`
      );
      return;
    }

    const adjustedSendOffset = ['follow_up', 'birthday'].includes(formData.type)
      ? formData.send_offset_hours
      : null;

    const payload = {
      name: formData.name,
      type: formData.type,
      message: formData.message,
      hours_before: ['reminder', 'confirmation'].includes(formData.type) ? formData.hours_before : null,
      send_offset_hours: adjustedSendOffset,
      // Janela de envio é definida globalmente por profissional (coluna do WhatsApp em Configurações).
      quiet_hours_start: null,
      quiet_hours_end: null,
      professional_id: targetProfId,
      is_active: formData.is_active,
    };
    if (editingId) {
      updateTemplate.mutate({ id: editingId, ...payload });
      setEditingId(null);
    } else {
      createTemplate.mutate(payload as any);
      setIsCreating(false);
    }
    setFormData(initialForm);
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(initialForm);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este template?')) {
      deleteTemplate.mutate(id);
    }
  };

  const handlePreviewSend = () => {
    const sampleClient = 'Maria Aparecida Silva';
    const message = renderTemplate(formData.message, {
      clientName: sampleClient,
      serviceName: 'Limpeza de pele',
      professionalName: professionals.find(p => p.id === formData.professional_id)?.name || 'Profissional',
      appointmentDate: new Date(),
      appointmentTime: '14:30',
    });
    setWhatsappPreviewMessage(message);
    setWhatsappPreviewOpen(true);
  };

  const getTypeLabel = (type: string) => templateTypes.find(t => t.value === type)?.label || type;
  const getProfName = (id: string | null) =>
    id ? (professionals.find(p => p.id === id)?.name || '—') : 'Todos os profissionais';

  const limitWarning = useMemo(() => {
    const targetProfId = formData.professional_id || null;
    const count = countForProfessional(targetProfId, editingId ?? undefined);
    return count >= MAX_TEMPLATES_PER_PROFESSIONAL;
  }, [formData.professional_id, templates, editingId]);

  return (
    <>
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Mensagens WhatsApp</CardTitle>
              <CardDescription>
                Até {MAX_TEMPLATES_PER_PROFESSIONAL} mensagens por profissional. Uma delas é a de
                <strong> Aniversário</strong> (envio em hora preferencial); as demais usam horas antes do
                agendamento. O envio é feito pelo WhatsApp do navegador/aparelho do profissional.
              </CardDescription>
            </div>
          </div>
          {!isCreating && !editingId && (
            <Button
              onClick={() => {
                setFormData({
                  ...initialForm,
                  professional_id: isStaff ? '' : (myProfessionalId ?? ''),
                });
                setIsCreating(true);
              }}
              size="sm"
              disabled={!ctxLoaded || (!isStaff && !myProfessionalId)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nova Mensagem
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-sm font-medium mb-1">Variáveis disponíveis</p>
          <p className="text-xs text-muted-foreground mb-2">
            Use apenas <strong>um colchete</strong> ao redor da variável, ex.: <code>{'{primeiro_nome}'}</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            {variablesHelp.map(v => (
              <Badge key={v.variable} variant="outline" className="text-xs">
                {v.variable} — {v.description}
              </Badge>
            ))}
          </div>
        </div>

        {(isCreating || editingId) && (
          <div className="rounded-lg border border-border p-4 space-y-4 bg-card">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Template</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Lembrete 24h"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: WhatsappTemplate['type']) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isStaff ? (
              <div className="space-y-2">
                <Label>Profissional (opcional)</Label>
                <Select
                  value={formData.professional_id || 'all'}
                  onValueChange={(v) => setFormData({ ...formData, professional_id: v === 'all' ? '' : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os profissionais</SelectItem>
                    {professionals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Estas mensagens serão usadas apenas para os seus atendimentos.
              </div>
            )}
            {isStaff && (
              <></>
            )}
            {/* warning placeholder kept below */}
            <div>
              {limitWarning && (
                <p className="text-xs text-destructive">
                  Este profissional já possui {MAX_TEMPLATES_PER_PROFESSIONAL} mensagens. Exclua uma antes de criar outra.
                </p>
              )}
            </div>

            {(formData.type === 'reminder' || formData.type === 'confirmation') && (
              <div className="space-y-2">
                <Label>Horas antes do agendamento</Label>
                <Input
                  type="number"
                  value={formData.hours_before}
                  onChange={(e) => setFormData({ ...formData, hours_before: Number(e.target.value) })}
                  min={1}
                  max={168}
                />
                <p className="text-xs text-muted-foreground">
                  Quantas horas antes do agendamento esta mensagem será disparada.
                </p>
              </div>
            )}

            {formData.type === 'follow_up' && (
              <div className="space-y-2">
                <Label>Horas após o atendimento</Label>
                <Input
                  type="number"
                  value={formData.send_offset_hours}
                  onChange={(e) => setFormData({ ...formData, send_offset_hours: Number(e.target.value) })}
                  min={1}
                  max={720}
                />
              </div>
            )}

            {formData.type === 'birthday' && (
              <div className="space-y-2">
                <Label>Hora preferencial de envio (0–23)</Label>
                <Input
                  type="number"
                  value={formData.send_offset_hours}
                  onChange={(e) => setFormData({ ...formData, send_offset_hours: Number(e.target.value) })}
                  min={0}
                  max={23}
                />
                <p className="text-xs text-muted-foreground">
                  A janela de envio permitida é definida no painel do WhatsApp (Configurações → WhatsApp). Mensagens fora da janela são ajustadas automaticamente.
                </p>
              </div>
            )}



            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Ex: Oi {primeiro_nome}, lembrando do seu horário em {data_extenso} às {horario}."
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Ativo</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePreviewSend} disabled={!formData.message}>
                  <Send className="h-4 w-4 mr-1" /> Testar no WhatsApp
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!formData.name || !formData.message || limitWarning}>
                  <Save className="h-4 w-4 mr-1" /> Salvar
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`rounded-lg border p-4 ${template.is_active ? 'border-border bg-card' : 'border-dashed border-muted bg-muted/30'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-medium text-foreground">{template.name}</h4>
                      <Badge variant={template.is_active ? 'default' : 'secondary'}>
                        {template.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">{getTypeLabel(template.type)}</Badge>
                      {(template.type === 'reminder' || template.type === 'confirmation') && template.hours_before && (
                        <Badge variant="outline" className="text-xs">{template.hours_before}h antes</Badge>
                      )}
                      {template.type === 'follow_up' && template.send_offset_hours != null && (
                        <Badge variant="outline" className="text-xs">{template.send_offset_hours}h depois</Badge>
                      )}
                      {template.type === 'birthday' && template.send_offset_hours != null && (
                        <Badge variant="outline" className="text-xs">às {String(template.send_offset_hours).padStart(2,'0')}:00</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{getProfName(template.professional_id)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{template.message}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(template)} disabled={editingId !== null || isCreating}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {templates.length === 0 && !isCreating && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum template configurado. Clique em "Nova Mensagem" para criar.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <WhatsappPreviewDialog
      open={whatsappPreviewOpen}
      onOpenChange={setWhatsappPreviewOpen}
      initialMessage={whatsappPreviewMessage}
      title="Testar mensagem no WhatsApp"
      description="Revise e edite a mensagem antes de enviar o teste."
    />
    </>
  );
}
