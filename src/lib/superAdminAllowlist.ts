/**
 * Allowlist da página Super Admin.
 * Apenas a criadora/desenvolvedora da plataforma pode acessar.
 * O papel `super_admin` no banco é a fonte de verdade para RPCs/edge functions;
 * esta lista é uma camada extra de proteção na UI.
 */
export const SUPER_ADMIN_EMAILS: string[] = [
  'mariaterezacastro2@gmail.com',
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
