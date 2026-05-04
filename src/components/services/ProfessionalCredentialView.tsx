import { useState } from 'react';
import { Eye, EyeOff, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  professionalId: string;
}

export function ProfessionalCredentialView({ professionalId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ temp_password: string | null; must_change_password: boolean; set_at: string; password_changed_at: string | null } | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from('professional_credentials')
        .select('temp_password, must_change_password, set_at, password_changed_at')
        .eq('professional_id', professionalId)
        .maybeSingle();
      if (error) throw error;
      setData(row as any);
    } catch (e: any) {
      toast.error('Erro ao carregar credenciais: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!data?.temp_password) return;
    navigator.clipboard.writeText(data.temp_password);
    toast.success('Senha copiada!');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !data) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver credenciais">
          <KeyRound className="h-4 w-4 text-amber-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium">Credenciais do profissional</div>
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && !data && <p className="text-xs text-muted-foreground">Nenhum registro de credencial.</p>}
          {!loading && data && (
            <>
              {data.temp_password ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Senha definida pelo admin:</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 px-2 py-1 rounded bg-muted text-xs font-mono">
                      {showPwd ? data.temp_password : '••••••••'}
                    </code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPwd(v => !v)}>
                      {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Senha não armazenada (recomendado). Para visualizar, gere uma nova senha.</p>
              )}
              <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
                <div>Definida em: {new Date(data.set_at).toLocaleString('pt-BR')}</div>
                <div>Trocada pelo profissional: {data.password_changed_at ? new Date(data.password_changed_at).toLocaleString('pt-BR') : '—'}</div>
                <div>Exige troca no login: {data.must_change_password ? 'Sim' : 'Não'}</div>
              </div>
              <p className="text-[10px] text-amber-600 pt-1">⚠️ Senhas armazenadas em texto representam risco de segurança.</p>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
