export const VERIFICATION_CODE_TTL_SECONDS = 600;
export const SIGNUP_GRANT_TTL_SECONDS = 900;

export function normalizeVerificationEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeVerificationCode(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').trim();
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function newOpaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function verificationError(code: unknown): string {
  switch (code) {
    case 'code_expired': return 'Código expirado. Solicite um novo código.';
    case 'no_active_code': return 'Nenhum código ativo. Solicite um novo código.';
    case 'too_many_attempts': return 'Muitas tentativas. Solicite um novo código.';
    case 'wrong_code': return 'Código incorreto. Confira os 6 dígitos recebidos por e-mail.';
    default: return 'Não foi possível conferir o código. Solicite um novo código.';
  }
}
export type VerificationType = 'signup' | 'login';

export function normalizeVerificationType(value: unknown): VerificationType {
  return String(value ?? '').trim().toLowerCase() === 'login' ? 'login' : 'signup';
}

/** Comparação em tempo constante (não revela quantos dígitos batem). */
export function verificationCodesMatch(a: unknown, b: unknown): boolean {
  const x = normalizeVerificationCode(a);
  const y = normalizeVerificationCode(b);
  if (x.length !== 6 || y.length !== 6) return false;
  let diff = 0;
  for (let i = 0; i < 6; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
type Client = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };

/**
 * Confere o código (com contagem de tentativas no banco). Para 'login'
 * (redefinição de senha) NÃO marca como usado — isso só acontece em
 * consumeVerificationCode, depois que a senha foi trocada.
 */
export async function checkVerificationCode(
  client: Client,
  params: { email: unknown; code: unknown; type: unknown; tokenHash?: string; requestId?: string; grantExpiresAt?: string },
): Promise<{ valid: boolean; code?: string; remaining?: number; expires_at?: string; error?: unknown }> {
  const email = normalizeVerificationEmail(params.email);
  const code = normalizeVerificationCode(params.code);
  if (!email || code.length !== 6) return { valid: false, code: 'invalid_input' };
  const { data, error } = await client.rpc('confirm_verification_code', {
    p_email: email,
    p_code: code,
    p_type: normalizeVerificationType(params.type),
    p_token_hash: params.tokenHash ?? await sha256('login-no-grant'),
    p_request_id: params.requestId ?? newRequestId(),
    p_grant_expires_at: params.grantExpiresAt ?? new Date(Date.now() + SIGNUP_GRANT_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) return { valid: false, code: 'temporary_error', error };
  return (data ?? { valid: false, code: 'temporary_error' });
}

/** Marca o código como usado. Chamar SOMENTE após concluir a ação protegida. */
export async function consumeVerificationCode(client: Client, params: { email: unknown; code: unknown; type: unknown }) {
  return client.rpc('consume_verification_code', {
    p_email: normalizeVerificationEmail(params.email),
    p_code: normalizeVerificationCode(params.code),
    p_type: normalizeVerificationType(params.type),
  });
}
