import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, ShieldCheck, ShieldOff, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSION_MODULES, normalizeRow, presetPermissions, type PermissionRow } from '@/lib/permissions';
import { PermissionsMatrix } from '@/components/admin/PermissionsMatrix';
import { useAccountSubscription } from '@/hooks/useAccountSubscription';
import { useSeatUsage } from '@/hooks/useSeatUsage';

type PermRow = PermissionRow;

function emptyPermissions(): PermRow[] {
  // Novo usuário começa como Profissional (somente os próprios dados).
  // O administrador amplia depois, se desejar.
  return presetPermissions('professional');
}


export function UsuariosContaSection() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole('admin');
  const { subscription } = useAccountSubscription();

  const [createOpen, setCreateOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<{ id: string; full_name: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['account-users', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, is_active, account_owner_id, must_change_password, deactivated_at')
        .or(`id.eq.${user.id},account_owner_id.eq.${user.id}`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && isAdmin,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase.functions.invoke('admin-toggle-user-active', {
        body: { user_id: id, is_active },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_, vars) => {
      toast.success(vars.is_active ? 'Usuário reativado.' : 'Usuário inativado.');
      qc.invalidateQueries({ queryKey: ['account-users'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-sm">Apenas administradores podem gerenciar usuários.</p>;
  }

  const activeCount = users.filter((u: { is_active: boolean }) => u.is_active).length;
  const limit = subscription?.seat_limit ?? 1;
  const limitLabel = subscription?.is_grandfathered ? 'ilimitado' : String(limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Usuários da conta</h3>
          <p className="text-xs text-muted-foreground">
            {activeCount} de {limitLabel} usuário(s) ativos
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Adicionar usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Equipe</CardTitle>
          <CardDescription className="text-xs">Defina permissões e ative/inative o acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {users.map((u: { id: string; full_name: string; email: string; is_active: boolean; account_owner_id: string | null }) => (
                <div key={u.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{u.full_name || u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="flex gap-1 mt-1">
                      {!u.account_owner_id && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
                      {u.is_active
                        ? <Badge className="text-[10px] bg-primary/20 text-primary dark:text-primary/80">Ativo</Badge>
                        : <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.account_owner_id && (
                      <Button size="sm" variant="outline" onClick={() => setPermsFor({ id: u.id, full_name: u.full_name || u.email })}>
                        <ShieldCheck className="h-4 w-4 mr-1" /> Permissões
                      </Button>
                    )}
                    {u.id !== user?.id && (
                      <Button
                        size="sm"
                        variant={u.is_active ? 'destructive' : 'default'}
                        onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                        disabled={toggleActive.isPending}
                      >
                        {u.is_active ? <><ShieldOff className="h-4 w-4 mr-1" />Inativar</> : <><ShieldCheck className="h-4 w-4 mr-1" />Reativar</>}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário ainda.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ['account-users'] })}
      />
      {permsFor && (
        <PermissionsDialog
          userId={permsFor.id}
          userName={permsFor.full_name}
          onClose={() => setPermsFor(null)}
        />
      )}
    </div>
  );
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => void }) {
  const navigate = useNavigate();
  const usage = useSeatUsage();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [perms, setPerms] = useState<PermRow[]>(emptyPermissions);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setEmail(''); setFullName(''); setPassword(''); setMustChange(true); setPerms(emptyPermissions());
  };

  const noSeats = !!usage && !usage.is_grandfathered && (usage.available ?? 0) <= 0;

  const goToPlans = () => {
    onOpenChange(false);
    navigate('/assinatura');
  };

  const submit = async () => {
    if (noSeats) {
      toast.error('Sem assentos disponíveis no seu plano.', {
        description: `Você usou ${usage?.used}/${usage?.seat_limit} usuários. Faça upgrade para adicionar mais.`,
        action: { label: 'Mudar de plano', onClick: goToPlans },
        duration: 12000,
      });
      return;
    }
    if (!email || !fullName || password.length < 8) {
      toast.error('Preencha nome, email e senha (mínimo 8 caracteres).');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-account-user', {
        body: { email, password, full_name: fullName, permissions: perms, must_change_password: mustChange },
      });
      if (error) throw error;
      if (data?.error) {
        // Trigger de banco pode devolver a mensagem de limite → sugerir upgrade.
        if (/seat|assento|limite/i.test(String(data.error))) {
          toast.error('Limite do plano atingido.', {
            description: String(data.error),
            action: { label: 'Mudar de plano', onClick: goToPlans },
            duration: 12000,
          });
          return;
        }
        throw new Error(data.error);
      }
      toast.success('Usuário criado com sucesso.');
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar usuário.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar usuário</DialogTitle>
          <DialogDescription>Defina dados de acesso e permissões iniciais.</DialogDescription>
        </DialogHeader>

        {noSeats && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
            <Crown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Seu plano atual não permite mais usuários</p>
              <p className="text-xs text-muted-foreground">
                Você já usa {usage?.used}/{usage?.seat_limit} assentos. Faça upgrade para cadastrar novos colaboradores.
              </p>
            </div>
            <Button size="sm" onClick={goToPlans}>Mudar de plano</Button>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} disabled={noSeats} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={noSeats} />
          </div>
          <div>
            <Label>Senha inicial</Label>
            <Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" disabled={noSeats} />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <Switch checked={mustChange} onCheckedChange={setMustChange} id="must-change" disabled={noSeats} />
            <Label htmlFor="must-change" className="text-sm">Forçar troca no 1º login</Label>
          </div>
        </div>

        <PermissionsMatrix value={perms} onChange={setPerms} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {noSeats ? (
            <Button onClick={goToPlans}>
              <Crown className="h-4 w-4 mr-1" /> Mudar de plano
            </Button>
          ) : (
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Criar usuário
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: existing, isLoading } = useQuery({
    queryKey: ['perms-of', userId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('user_permissions').select('*').eq('user_id', userId);
      return (data ?? []) as Array<Partial<PermRow> & { module: string }>;
    },
  });

  const [perms, setPerms] = useState<PermRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const rows: PermRow[] = perms ?? PERMISSION_MODULES.map(m =>
    normalizeRow(m.key, (existing || []).find(p => p.module === m.key)),
  );

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-permissions', {
        body: { user_id: userId, permissions: rows },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Permissões atualizadas.');
      qc.invalidateQueries({ queryKey: ['perms-of', userId] });
      qc.invalidateQueries({ queryKey: ['user-permissions'] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões — {userName}</DialogTitle>
          <DialogDescription>
            Defina, por módulo, o que este usuário pode fazer, se vê valores e quais dados alcança.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <PermissionsMatrix value={rows} onChange={setPerms} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

