import { useState, useEffect } from 'react';
import { Client } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Edit, Save, X, User, Clock, Plus, Minus, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProfessionals } from '@/hooks/useProfessionals';
import { parseLooseDateToISO } from '@/lib/dateInputPaste';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

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
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);
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
        if (data) setLastEditorName(data.full_name);
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

  const handleAddCredit = async () => {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }
    setCreditLoading(true);
    try {
      const newBalance = (client.credit_balance || 0) + amount;
      await onUpdate({ credit_balance: newBalance });
      toast.success(`Crédito de ${formatCurrency(amount)} adicionado!`);
      setCreditAmount('');
      setCreditDialogOpen(false);
    } catch (error) {
      console.error('Error adding credit:', error);
      toast.error('Erro ao adicionar crédito');
    } finally {
      setCreditLoading(false);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Main Info Card */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground">Informações</h3>
            {!editing ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={loading}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {loading ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Nome</Label>
              {editing ? (
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-8 text-xs" />
              ) : (
                <p className="text-sm font-medium">{client.name}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Telefone</Label>
              {editing ? (
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="h-8 text-xs" />
              ) : (
                <p className="text-sm">{client.phone}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Email</Label>
              {editing ? (
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-8 text-xs" />
              ) : (
                <p className="text-sm">{client.email || '-'}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">CPF</Label>
              {editing ? (
                <Input value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" className="h-8 text-xs" />
              ) : (
                <p className="text-sm">{client.cpf || '-'}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Nascimento</Label>
              {editing ? (
                <Input type="date" value={formData.birthdate} onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })} className="h-8 text-xs" />
              ) : (
                <p className="text-sm">{client.birthdate ? format(new Date(client.birthdate + 'T12:00:00'), "dd/MM/yyyy") : '-'}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Como nos conheceu</Label>
              {editing ? (
                <Select value={formData.referral_source} onValueChange={(v) => setFormData({ ...formData, referral_source: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_SOURCES.map(source => (
                      <SelectItem key={source.value} value={source.value} className="text-xs">{source.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{REFERRAL_SOURCES.find(s => s.value === client.referral_source)?.label || '-'}</p>
              )}
            </div>

            {/* Client Credit Balance */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Crédito</Label>
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-medium ${(client.credit_balance || 0) > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {formatCurrency(client.credit_balance || 0)}
                </p>
                {isAdminOrReceptionist && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreditDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Status</Label>
              {editing ? (
                <div className="flex items-center gap-2 h-8">
                  <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                  <span className="text-xs">{formData.is_active ? 'Ativo' : 'Inativo'}</span>
                </div>
              ) : (
                <p className={`text-sm font-medium ${client.is_active ? 'text-green-600' : 'text-destructive'}`}>
                  {client.is_active ? 'Ativo' : 'Inativo'}
                </p>
              )}
            </div>

            {(isAdminOrReceptionist || client.assigned_professional_id) && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Profissional</Label>
                {editing ? (
                  <Select value={formData.assigned_professional_id} onValueChange={(v) => setFormData({ ...formData, assigned_professional_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Nenhum</SelectItem>
                      {activeProfessionals.map(professional => (
                        <SelectItem key={professional.id} value={professional.id} className="text-xs">{professional.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">
                    {client.assigned_professional?.name || 
                     activeProfessionals.find(p => p.id === client.assigned_professional_id)?.name || 
                     '-'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Observações</Label>
              {editing ? (
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="text-xs" placeholder="Observações..." />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{client.notes || '-'}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Informações Complementares</Label>
              {editing ? (
                <Textarea value={formData.complementary_info} onChange={(e) => setFormData({ ...formData, complementary_info: e.target.value })} rows={3} className="text-xs" placeholder="Alergias, preferências..." />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{client.complementary_info || '-'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Info - Compact */}
      <Card className="bg-muted/30">
        <CardContent className="p-2.5">
          <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Atualizado: {format(new Date(client.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
            </div>
            {lastEditorName && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>Por: {lastEditorName}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Cadastro: {format(new Date(client.created_at), "dd/MM/yy", { locale: ptBR })}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Add Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Adicionar Crédito
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Saldo atual: <strong className="text-foreground">{formatCurrency(client.credit_balance || 0)}</strong>
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Valor do crédito (R$)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="0,00"
                className="h-8 text-xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Este valor será usado como desconto em pagamentos futuros e não entrará no caixa.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleAddCredit} disabled={creditLoading}>
                {creditLoading ? 'Salvando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}