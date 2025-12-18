import { useState } from 'react';
import { MessageSquare, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useWhatsappTemplates, WhatsappTemplate } from '@/hooks/useWhatsappTemplates';

const templateTypes = [
  { value: 'reminder', label: 'Lembrete de Agendamento' },
  { value: 'birthday', label: 'Aniversário' },
  { value: 'confirmation', label: 'Confirmação' },
  { value: 'follow_up', label: 'Pós-atendimento' },
];

const variablesHelp = [
  { variable: '{{cliente}}', description: 'Nome do cliente' },
  { variable: '{{data}}', description: 'Data do agendamento' },
  { variable: '{{horario}}', description: 'Horário do agendamento' },
  { variable: '{{servico}}', description: 'Nome do serviço' },
  { variable: '{{profissional}}', description: 'Nome do profissional' },
];

export function WhatsappTemplatesSettings() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useWhatsappTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'reminder' as WhatsappTemplate['type'],
    message: '',
    hours_before: 24,
    is_active: true,
  });

  const handleEdit = (template: WhatsappTemplate) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      type: template.type,
      message: template.message,
      hours_before: template.hours_before || 24,
      is_active: template.is_active,
    });
  };

  const handleSave = () => {
    if (editingId) {
      updateTemplate.mutate({ id: editingId, ...formData });
      setEditingId(null);
    } else {
      createTemplate.mutate(formData);
      setIsCreating(false);
    }
    resetForm();
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsCreating(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'reminder',
      message: '',
      hours_before: 24,
      is_active: true,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este template?')) {
      deleteTemplate.mutate(id);
    }
  };

  const getTypeLabel = (type: string) => {
    return templateTypes.find(t => t.value === type)?.label || type;
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Mensagens WhatsApp</CardTitle>
              <CardDescription>Configure as mensagens automáticas enviadas aos clientes</CardDescription>
            </div>
          </div>
          {!isCreating && !editingId && (
            <Button onClick={() => setIsCreating(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nova Mensagem
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variables Help */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-sm font-medium mb-2">Variáveis disponíveis:</p>
          <div className="flex flex-wrap gap-2">
            {variablesHelp.map(v => (
              <Badge key={v.variable} variant="outline" className="text-xs">
                {v.variable} - {v.description}
              </Badge>
            ))}
          </div>
        </div>

        {/* Create/Edit Form */}
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === 'reminder' && (
              <div className="space-y-2">
                <Label>Horas antes do agendamento</Label>
                <Input
                  type="number"
                  value={formData.hours_before}
                  onChange={(e) => setFormData({ ...formData, hours_before: Number(e.target.value) })}
                  min={1}
                  max={168}
                />
                <p className="text-xs text-muted-foreground">Quando a mensagem será enviada antes do agendamento</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Digite a mensagem usando as variáveis disponíveis..."
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Ativo</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!formData.name || !formData.message}>
                  <Save className="h-4 w-4 mr-1" />
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Templates List */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`rounded-lg border p-4 ${
                  template.is_active ? 'border-border bg-card' : 'border-dashed border-muted bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground">{template.name}</h4>
                      <Badge variant={template.is_active ? 'default' : 'secondary'}>
                        {template.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">{getTypeLabel(template.type)}</Badge>
                      {template.type === 'reminder' && template.hours_before && (
                        <Badge variant="outline" className="text-xs">
                          {template.hours_before}h antes
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                      {template.message}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                      disabled={editingId !== null || isCreating}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                      className="text-destructive hover:text-destructive"
                    >
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
  );
}
