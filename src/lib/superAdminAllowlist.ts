/**
 * Allowlist da página Super Admin.
 *
 * A fonte de verdade da autorização é o papel `super_admin` no banco
 * (validado por RPC/edge functions). Esta camada apenas esconde a UI
 * para reduzir descoberta acidental.
 *
 * Configure via `VITE_SUPER_ADMIN_EMAILS` (lista separada por vírgula).
 * Sem fallback hardcoded — emails pessoais não devem ser embarcados no bundle.
 */
function parseEnvEmails(): string[] {
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.VITE_SUPER_ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const SUPER_ADMIN_EMAILS: string[] = Array.from(new Set(parseEnvEmails()));

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  if (SUPER_ADMIN_EMAILS.length === 0) return true; // fallback: rely on DB role check
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
