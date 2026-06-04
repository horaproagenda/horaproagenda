import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { APP_MODULES, type AppModuleKey } from '@/lib/plans';
import { useAccountSubscription } from '@/hooks/useAccountSubscription';

type PermRow = { module: AppModuleKey; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

function emptyPermissions(): PermRow[] {
  return APP_MODULES.map(m => ({ module: m.key, can_view: false, can_create: false, can_edit: false, can_delete: false }));
}

export default function UsuariosConta() {
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
    return (
      <AppLayout title="Usuários">
        <PageTransition>
          <div className="p-6"><p className="text-sm">Apenas administradores podem gerenciar usuários.</p></div>
        </PageTransition>
      </AppLayout>
    );
  }

  const activeCount = users.filter((u: { is_active: boolean }) => u.is_active).length;
  const limit = subscription?.seat_limit ?? 1;
  const limitLabel = subscription?.is_grandfathered ? 'ilimitado' : String(limit);

  return (
    <AppLayout title="Usuários">
      <PageTransition>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Usuários da conta</h1>
              <p className="text-sm text-muted-foreground">
                {activeCount} de {limitLabel} usuário(s) ativos
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Adicionar usuário
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Equipe</CardTitle>
              <CardDescription>Defina permissões e ative/inative o acesso.</CardDescription>
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
                            ? <Badge className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Ativo</Badge>
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
      </PageTransition>
    </AppLayout>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [perms, setPerms] = useState<PermRow[]>(emptyPermissions);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setEmail(''); setFullName(''); setPassword(''); setMustChange(true); setPerms(emptyPermissions());
  };

  const submit = async () => {
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
      if (data?.error) throw new Error(data.error);
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
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Senha inicial</Label>
            <Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <Switch checked={mustChange} onCheckedChange={setMustChange} id="must-change" />
            <Label htmlFor="must-change" className="text-sm">Forçar troca no 1º login</Label>
          </div>
        </div>

        <PermissionsMatrix value={perms} onChange={setPerms} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    queryKey: ['perms-of', userId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('user_permissions').select('*').eq('user_id', userId);
      return data ?? [];
    },
  });
  const initial: PermRow[] = APP_MODULES.map(m => {
    const found = (existing || []).find((p: { module: string }) => p.module === m.key);
    return {
      module: m.key,
      can_view: !!found?.can_view, can_create: !!found?.can_create,
      can_edit: !!found?.can_edit, can_delete: !!found?.can_delete,
    };
  });
  const [perms, setPerms] = useState<PermRow[]>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-permissions', {
        body: { user_id: userId, permissions: perms },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Permissões atualizadas.');
      qc.invalidateQueries({ queryKey: ['perms-of', userId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões — {userName}</DialogTitle>
          <DialogDescription>Marque o que este usuário pode fazer em cada área.</DialogDescription>
        </DialogHeader>
        <PermissionsMatrix value={perms} onChange={setPerms} />
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

function PermissionsMatrix({ value, onChange }: { value: PermRow[]; onChange: (v: PermRow[]) => void }) {
  const update = (idx: number, key: keyof PermRow, val: boolean) => {
    const copy = [...value];
    // @ts-expect-error generic
    copy[idx][key] = val;
    // Marcar can_view ao marcar qualquer ação dependente
    if (val && (key === 'can_create' || key === 'can_edit' || key === 'can_delete')) {
      copy[idx].can_view = true;
    }
    onChange(copy);
  };
  return (
    <div className="border rounded-lg overflow-hidden mt-2">
      <table className="w-full text-xs">
        <thead className="bg-muted">
          <tr>
            <th className="text-left p-2 text-[11px] font-semibold">Módulo</th>
            <th className="text-center p-2 text-[11px] font-semibold">Ver</th>
            <th className="text-center p-2 text-[11px] font-semibold">Criar</th>
            <th className="text-center p-2 text-[11px] font-semibold">Editar</th>
            <th className="text-center p-2 text-[11px] font-semibold">Excluir</th>
          </tr>
        </thead>
        <tbody>
          {value.map((row, idx) => (
            <tr key={row.module} className="border-t">
              <td className="p-2">{APP_MODULES.find(m => m.key === row.module)?.label}</td>
              {(['can_view','can_create','can_edit','can_delete'] as const).map(key => (
                <td key={key} className="text-center p-2">
                  <Switch checked={row[key]} onCheckedChange={(b) => update(idx, key, b)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
