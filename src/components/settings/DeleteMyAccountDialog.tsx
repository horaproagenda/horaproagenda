import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const CONFIRMATION = 'EXCLUIR MINHA CONTA';

export function DeleteMyAccountDialog() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmation.trim().toUpperCase() !== CONFIRMATION) {
      toast.error(`Digite exatamente "${CONFIRMATION}" para confirmar.`);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-account', {
        body: { confirmation: CONFIRMATION },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao excluir conta.');

      toast.success('Conta excluída com sucesso.');
      await signOut();
      window.location.href = '/auth';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado.';
      toast.error(`Não foi possível excluir: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmation(''); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="h-8 text-xs">
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir minha conta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Excluir minha conta
          </DialogTitle>
          <DialogDescription className="text-xs space-y-2 pt-2">
            <span className="block">
              Esta ação é <strong>irreversível</strong>. Todos os seus dados (clientes,
              agendamentos, pacotes, financeiro, documentos e configurações) serão apagados
              permanentemente.
            </span>
            <span className="block rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-2 text-amber-700 dark:text-amber-300">
              ⚠️ Após a exclusão, você <strong>não poderá usar o período gratuito</strong> de 7 dias
              novamente pelos próximos <strong>6 meses</strong> com os mesmos dados (e-mail, CPF, CNPJ
              ou telefone). Para voltar a usar antes desse prazo, será necessário contratar um plano
              pago.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-delete" className="text-xs">
            Para confirmar, digite <strong>{CONFIRMATION}</strong>:
          </Label>
          <Input
            id="confirm-delete"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION}
            className="h-9 text-sm"
            disabled={loading}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={loading || confirmation.trim().toUpperCase() !== CONFIRMATION}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Excluir definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
