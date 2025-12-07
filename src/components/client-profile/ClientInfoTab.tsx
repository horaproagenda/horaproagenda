import { useState } from 'react';
import { Client } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Edit, Save, X } from 'lucide-react';

interface ClientInfoTabProps {
  client: Client;
  onUpdate: (updates: Partial<Client>) => Promise<unknown>;
}

export function ClientInfoTab({ client, onUpdate }: ClientInfoTabProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: client.name,
    email: client.email || '',
    phone: client.phone,
    birthdate: client.birthdate || '',
    notes: client.notes || '',
    complementary_info: client.complementary_info || '',
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      await onUpdate({
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim(),
        birthdate: formData.birthdate || null,
        notes: formData.notes.trim() || null,
        complementary_info: formData.complementary_info.trim() || null,
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
      birthdate: client.birthdate || '',
      notes: client.notes || '',
      complementary_info: client.complementary_info || '',
    });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Informações Complementares</CardTitle>
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
            <Label>Data de Nascimento</Label>
            {editing ? (
              <Input
                type="date"
                value={formData.birthdate}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
              />
            ) : (
              <p className="text-foreground">{client.birthdate || '-'}</p>
            )}
          </div>
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
              placeholder="Alergias, preferências, histórico médico relevante, outras informações importantes..."
            />
          ) : (
            <p className="text-foreground whitespace-pre-wrap">
              {client.complementary_info || 'Nenhuma informação complementar'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
