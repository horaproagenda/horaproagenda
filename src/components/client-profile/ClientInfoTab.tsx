import { useState, useEffect } from 'react';
import { Client } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Edit, Save, X, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';

const REFERRAL_SOURCES = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'outro', label: 'Outro' },
];

interface ClientInfoTabProps {
  client: Client;
  onUpdate: (updates: Partial<Client>) => Promise<unknown>;
}

export function ClientInfoTab({ client, onUpdate }: ClientInfoTabProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastEditorName, setLastEditorName] = useState<string | null>(null);
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');
  const activeProfessionals = professionals.filter(p => p.is_active);
  
  const [formData, setFormData] = useState({
    name: client.name,
    email: client.email || '',
    phone: client.phone,
    cpf: client.cpf || '',
    birthdate: client.birthdate || '',
    notes: client.notes || '',
    complementary_info: client.complementary_info || '',
    is_active: client.is_active,
    referral_source: client.referral_source || '',
    assigned_professional_id: client.assigned_professional_id || '',
  });

  useEffect(() => {
    async function fetchEditorName() {
      if (client.updated_by) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', client.updated_by)
          .maybeSingle();
        if (data) {
          setLastEditorName(data.full_name);
        }
      }
    }
    fetchEditorName();
  }, [client.updated_by]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await onUpdate({
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim(),
        cpf: formData.cpf.trim() || null,
        birthdate: formData.birthdate || null,
        notes: formData.notes.trim() || null,
        complementary_info: formData.complementary_info.trim() || null,
        is_active: formData.is_active,
        referral_source: formData.referral_source || null,
        assigned_professional_id: formData.assigned_professional_id || null,
        updated_by: user?.id || null,
      });
      setEditing(false);
    } catch (error) {
      console.error('Error updating client:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: client.name,
      email: client.email || '',
      phone: client.phone,
      cpf: client.cpf || '',
      birthdate: client.birthdate || '',
      notes: client.notes || '',
      complementary_info: client.complementary_info || '',
      is_active: client.is_active,
      referral_source: client.referral_source || '',
      assigned_professional_id: client.assigned_professional_id || '',
    });
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Informações do Cliente</CardTitle>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading}>
                <Save className="h-4 w-4 mr-1" />
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              {editing ? (
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              ) : (
                <p className="text-foreground">{client.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              {editing ? (
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              ) : (
                <p className="text-foreground">{client.phone}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              {editing ? (
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              ) : (
                <p className="text-foreground">{client.email || '-'}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>CPF</Label>
              {editing ? (
                <Input
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              ) : (
                <p className="text-foreground">{client.cpf || '-'}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data de Nascimento</Label>
              {editing ? (
                <Input
                  type="date"
                  value={formData.birthdate}
                  onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                />
              ) : (
                <p className="text-foreground">
                  {client.birthdate 
                    ? format(new Date(client.birthdate), "dd/MM/yyyy")
                    : '-'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Como nos conheceu</Label>
              {editing ? (
                <Select 
                  value={formData.referral_source} 
                  onValueChange={(v) => setFormData({ ...formData, referral_source: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_SOURCES.map(source => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-foreground">
                  {REFERRAL_SOURCES.find(s => s.value === client.referral_source)?.label || '-'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              {editing ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <span className="text-sm">{formData.is_active ? 'Ativo' : 'Inativo'}</span>
                </div>
              ) : (
                <p className={`text-sm font-medium ${client.is_active ? 'text-green-600' : 'text-destructive'}`}>
                  {client.is_active ? 'Ativo' : 'Inativo'}
                </p>
              )}
            </div>

            {isAdminOrReceptionist && (
              <div className="space-y-2">
                <Label>Profissional Responsável</Label>
                {editing ? (
                  <Select 
                    value={formData.assigned_professional_id} 
                    onValueChange={(v) => setFormData({ ...formData, assigned_professional_id: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um profissional..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {activeProfessionals.map(professional => (
                        <SelectItem key={professional.id} value={professional.id}>
                          {professional.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-foreground">
                    {client.assigned_professional?.name || 'Nenhum profissional atribuído'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            {editing ? (
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Observações sobre o cliente..."
              />
            ) : (
              <p className="text-foreground whitespace-pre-wrap">
                {client.notes || 'Nenhuma observação'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Informações Complementares</Label>
            {editing ? (
              <Textarea
                value={formData.complementary_info}
                onChange={(e) => setFormData({ ...formData, complementary_info: e.target.value })}
                rows={5}
                placeholder="Alergias, preferências, histórico médico relevante..."
              />
            ) : (
              <p className="text-foreground whitespace-pre-wrap">
                {client.complementary_info || 'Nenhuma informação complementar'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Info */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Última atualização: {format(new Date(client.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
            </div>
            {lastEditorName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Editado por: {lastEditorName}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Cadastrado em: {format(new Date(client.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
