/**
 * Allowlist da página Super Admin.
 * Apenas a criadora/desenvolvedora da plataforma pode acessar.
 *
 * Fontes da allowlist (combinadas):
 *  1. Variável de ambiente `VITE_SUPER_ADMIN_EMAILS` (lista separada por vírgula).
 *  2. Lista fixa abaixo (fallback para o caso de a env não estar configurada).
 *
 * O papel `super_admin` no banco continua sendo a fonte de verdade para
 * RPCs/edge functions; esta lista é uma camada extra de proteção na UI.
 */
const FALLBACK_EMAILS = ['mariaterezacastro2@gmail.com'];

function parseEnvEmails(): string[] {
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.VITE_SUPER_ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const SUPER_ADMIN_EMAILS: string[] = Array.from(
  new Set([...parseEnvEmails(), ...FALLBACK_EMAILS.map((e) => e.toLowerCase())]),
);

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
