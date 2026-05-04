import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Bloqueia toda a UI até que o profissional troque a senha,
 * caso o admin tenha marcado "exigir troca no primeiro login".
 */
export function ForcePasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mustChange, setMustChange] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setMustChange(false); setChecking(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('must_change_password_for_current_user');
        if (!cancelled && !error) setMustChange(!!data);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSave = async () => {
    if (pwd.length < 8) { toast.error('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (pwd !== pwd2) { toast.error('As senhas não coincidem.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc('mark_password_changed');
      if (rpcErr) throw rpcErr;
      toast.success('Senha atualizada com sucesso!');
      setMustChange(false);
      setPwd(''); setPwd2('');
    } catch (e: any) {
      toast.error('Erro ao atualizar senha: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (checking) return <>{children}</>;

  return (
    <>
      {children}
      <Dialog open={mustChange} onOpenChange={() => { /* não permite fechar */ }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle>Defina sua nova senha</DialogTitle>
                <DialogDescription className="text-xs">
                  Por segurança, é necessário trocar a senha temporária no primeiro acesso.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="np" className="text-xs">Nova senha (mín. 8)</Label>
              <Input id="np" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="np2" className="text-xs">Confirmar nova senha</Label>
              <Input id="np2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar nova senha
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
