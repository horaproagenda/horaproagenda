import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';

export function ChangeMyPasswordCard() {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) { toast.error('A senha precisa ter no mínimo 8 caracteres.'); return; }
    if (pwd !== confirm) { toast.error('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      // Limpa flag must_change_password
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('profiles').update({ must_change_password: false }).eq('id', user.id);
      }
      toast.success('Senha alterada com sucesso.');
      setPwd(''); setConfirm('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />Alterar senha</CardTitle>
        <CardDescription>Defina uma nova senha de acesso. Mínimo 8 caracteres.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3 max-w-sm">
          <div>
            <Label htmlFor="newpwd">Nova senha</Label>
            <Input id="newpwd" type="password" value={pwd} onChange={e => setPwd(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="confirmpwd">Confirmar nova senha</Label>
            <Input id="confirmpwd" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Alterar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
