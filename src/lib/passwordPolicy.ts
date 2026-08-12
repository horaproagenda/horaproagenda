/**
 * Política única de senha do aplicativo.
 *
 * Usada tanto na troca de senha do usuário logado (`passwordChange.ts`) quanto
 * na redefinição por código de e-mail (`Auth.tsx` → função `reset-password`),
 * para que a senha nunca chegue ao serviço de autenticação fora da política e
 * o usuário nunca receba um erro genérico sem saber o que corrigir.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Requisitos exigidos pelo serviço de autenticação do projeto (verificados em
 * execução): letra minúscula, letra maiúscula, número e símbolo.
 */
export const PASSWORD_RULES_HINT =
  'Mínimo de 8 caracteres, com letra maiúscula, letra minúscula, número e símbolo (ex.: !@#$).';

const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

/** Validação local (mesmas regras no cliente e no servidor). */
export function validateNewPassword(password: string, confirm?: string): string | null {
  if (!password || (confirm !== undefined && !confirm)) {
    return 'Preencha a nova senha e a confirmação.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A nova senha precisa ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (/\s/.test(password)) return 'A nova senha não pode conter espaços.';
  if (!/[a-z]/.test(password)) return 'Inclua pelo menos uma letra minúscula na nova senha.';
  if (!/[A-Z]/.test(password)) return 'Inclua pelo menos uma letra maiúscula na nova senha.';
  if (!/\d/.test(password)) return 'Inclua pelo menos um número na nova senha.';
  if (!SYMBOLS.test(password)) return 'Inclua pelo menos um símbolo na nova senha (ex.: ! @ # $).';
  if (confirm !== undefined && password !== confirm) {
    return 'As senhas digitadas não são iguais. Confira e tente novamente.';
  }
  return null;
}


/** Traduz as falhas do serviço de autenticação em explicações claras. */
export function explainPasswordUpdateError(error: unknown): string {
  const raw = error as { message?: string; code?: string; status?: number } | null;
  const code = (raw?.code || '').toLowerCase();
  const message = (raw?.message || '').toLowerCase();

  if (code === 'same_password' || message.includes('should be different from the old password')) {
    return 'A nova senha precisa ser diferente da senha atual. Escolha outra senha.';
  }
  if (message.includes('at least') && message.includes('characters')) {
    return `A nova senha é curta demais. Use no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (message.includes('one character of each') || message.includes('required characters')) {
    return `A senha não atende aos requisitos de segurança. ${PASSWORD_RULES_HINT}`;
  }
  if (
    code === 'weak_password' ||
    message.includes('weak') ||
    message.includes('pwned') ||
    message.includes('easy to guess') ||
    message.includes('compromised')
  ) {
    return `Essa senha é fraca ou já apareceu em vazamentos. ${PASSWORD_RULES_HINT}`;
  }

  if (code === 'user_not_found' || message.includes('user not found')) {
    return 'Este e-mail não possui cadastro. Faça um novo cadastro para acessar o aplicativo.';
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
