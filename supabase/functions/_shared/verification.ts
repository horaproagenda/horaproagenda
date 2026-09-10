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