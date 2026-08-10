import { supabase } from '@/integrations/supabase/client';

export interface ChangePasswordResult {
  success: boolean;
  /** Mensagem já pronta para exibir ao usuário, em português claro. */
  message: string;
}

/** Validação local antes de chamar o servidor. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password || !confirm) return 'Preencha a nova senha e a confirmação.';
  if (password.length < 8) return 'A nova senha precisa ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Para maior segurança, use letras e números na nova senha.';
  }
  if (/\s/.test(password)) return 'A nova senha não pode começar, terminar ou conter espaços.';
  if (password !== confirm) return 'As senhas digitadas não são iguais. Confira e tente novamente.';
  return null;
}

/** Traduz as falhas do serviço de autenticação em explicações claras. */
function explainAuthError(error: unknown): string {
  const raw = error as { message?: string; code?: string; status?: number } | null;
  const code = (raw?.code || '').toLowerCase();
  const message = (raw?.message || '').toLowerCase();

  if (code === 'same_password' || message.includes('should be different from the old password')) {
    return 'A nova senha precisa ser diferente da senha atual. Escolha outra senha.';
  }
  if (code === 'weak_password' || message.includes('weak') || message.includes('pwned') || message.includes('easy to guess')) {
    return 'Essa senha é muito comum ou fácil de descobrir. Escolha uma senha mais forte, com letras, números e no mínimo 8 caracteres.';
  }
  if (message.includes('at least') && message.includes('characters')) {
    return 'A nova senha é curta demais. Use no mínimo 8 caracteres.';
  }
  if (
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    raw?.status === 401 ||
    message.includes('jwt') ||
    message.includes('session') ||
    message.includes('not authenticated') ||
    message.includes('user from sub claim')
  ) {
    return 'Sua sessão expirou. Entre novamente no aplicativo e repita a troca de senha.';
  }
  if (code === 'reauthentication_needed' || message.includes('reauthentication')) {
    return 'Por segurança, entre novamente no aplicativo e repita a troca de senha.';
  }
  if (code === 'over_request_rate_limit' || raw?.status === 429 || message.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Não conseguimos falar com o servidor. Verifique sua conexão com a internet e tente novamente.';
  }
  return 'Não foi possível alterar a senha agora. Tente novamente em instantes; se continuar, fale com o suporte.';
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
