import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL || 'https://nsgcllrbswodjoadybsj.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE';

export const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || '';
export const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || '';

export const hasCreds = Boolean(TEST_EMAIL && TEST_PASSWORD);

export function makeClient(): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authedClient(): Promise<SupabaseClient> {
  const c = makeClient();
  const { error } = await c.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`Smoke login failed: ${error.message}`);
  return c;
}

export const SMOKE_TAG = `__smoke_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

export function tag(label: string) {
  return `${label} ${SMOKE_TAG}`;
}

/**
 * Trava contra falso positivo: no CI (ou com SMOKE_REQUIRE_CREDS=1) a
 * ausência de credenciais FALHA a execução em vez de pular os testes.
 * Localmente, sem a flag, os testes são pulados com aviso explícito.
 */
export const requireCreds =
  process.env.SMOKE_REQUIRE_CREDS === '1' || process.env.CI === 'true';

if (!hasCreds && requireCreds) {
  throw new Error(
    'Smoke tests: SMOKE_TEST_EMAIL e SMOKE_TEST_PASSWORD são obrigatórios. ' +
      'Configure-os em GitHub > Settings > Secrets and variables > Actions. ' +
      'Os testes de permissão não serão pulados silenciosamente.',
  );
}

if (!hasCreds) {
  console.warn(
    '\n⚠️  Smoke tests autenticados PULADOS: defina SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD. ' +
      'Isto NÃO é uma aprovação.\n',
  );
}

export const describeIfCreds = hasCreds
  ? describe
  : (name: string, fn: () => void) =>
      describe.skip(`${name} (skipped — set SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD)`, fn);
