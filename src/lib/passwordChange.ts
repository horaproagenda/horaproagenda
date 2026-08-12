import { supabase } from '@/integrations/supabase/client';
import { explainPasswordUpdateError, validateNewPassword } from '@/lib/passwordPolicy';

export interface ChangePasswordResult {
  success: boolean;
  /** Mensagem já pronta para exibir ao usuário, em português claro. */
  message: string;
}

export { validateNewPassword };

/** Traduz as falhas do serviço de autenticação em explicações claras. */
function explainAuthError(error: unknown): string {
  return explainPasswordUpdateError(error);
}


/**
 * Altera a senha do usuário logado de forma resiliente:
 * 1. garante que a sessão está válida (renova se necessário);
 * 2. atualiza a senha no serviço de autenticação;
 * 3. limpa a marcação de "trocar senha no primeiro acesso" (falha aqui não
 *    invalida a troca, que já foi concluída com sucesso).
 */
export async function changeOwnPassword(password: string, confirm: string): Promise<ChangePasswordResult> {
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return { success: false, message: invalid };

  // 1) Sessão válida?
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return {
        success: false,
        message: 'Sua sessão expirou. Entre novamente no aplicativo e repita a troca de senha.',
      };
    }
  }

  // 2) Atualiza a senha
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { success: false, message: explainAuthError(error) };
  }

  // 3) Limpa a exigência de troca (não bloqueia o sucesso)
  try {
    await supabase.rpc('mark_password_changed');
  } catch {
    /* a senha já foi alterada; a marcação é sincronizada no próximo acesso */
  }

  return { success: true, message: 'Senha alterada com sucesso.' };
}
