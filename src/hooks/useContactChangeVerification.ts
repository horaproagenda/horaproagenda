import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ContactChangeType = 'email' | 'phone';

/**
 * Hook que orquestra a verificação por código (6 dígitos enviado ao
 * e-mail atual do usuário) ao alterar e-mail ou celular nas Configurações.
 */
export function useContactChangeVerification() {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const sendCode = async (type: ContactChangeType, newValue: string) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'send-contact-change-code',
        { body: { type, newValue } },
      );
      if (error) {
        let payload: any = null;
        try { payload = await (error as any)?.context?.json?.(); } catch { /* ignore */ }
        throw new Error(payload?.error || error.message || 'Erro ao enviar código');
      }
      if (data?.error) throw new Error(data.error);
      toast.success('Código enviado para o seu e-mail atual.');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar código');
      return false;
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (type: ContactChangeType, newValue: string, code: string) => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'verify-contact-change',
        { body: { type, newValue, code } },
      );
      if (error) {
        let payload: any = null;
        try { payload = await (error as any)?.context?.json?.(); } catch { /* ignore */ }
        throw new Error(payload?.error || error.message || 'Código inválido');
      }
      if (data?.error) throw new Error(data.error);
      toast.success(
        type === 'email'
          ? 'E-mail atualizado com sucesso.'
          : 'Celular atualizado com sucesso.',
      );
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Código inválido');
      return false;
    } finally {
      setVerifying(false);
    }
  };

  return { sendCode, verifyCode, sending, verifying };
}
