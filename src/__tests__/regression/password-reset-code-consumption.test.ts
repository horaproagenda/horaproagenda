import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fn = (name: string) =>
  readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', name, 'index.ts'), 'utf8');
const shared = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'verification.ts'), 'utf8');

describe('redefinição de senha: código gasto só após a troca', () => {
  it('módulo compartilhado concentra normalização, comparação e consumo', () => {
    expect(shared).toContain('export function normalizeVerificationCode');
    expect(shared).toContain('export function normalizeVerificationType');
    expect(shared).toContain('export async function checkVerificationCode');
    expect(shared).toContain('export async function consumeVerificationCode');
  });

  it('as quatro funções usam o módulo compartilhado', () => {
    for (const f of ['verify-code', 'reset-password', 'send-verification-code', 'complete-signup']) {
      expect(fn(f)).toContain('../_shared/verification.ts');
    }
  });

  it('reset-password confere o código de novo e só consome depois de trocar a senha', () => {
    const s = fn('reset-password');
    const check = s.indexOf('checkVerificationCode(supabaseAdmin');
    const update = s.indexOf('auth.admin.updateUserById');
    const consume = s.indexOf('consumeVerificationCode(supabaseAdmin');
    expect(check).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(check);
    expect(consume).toBeGreaterThan(update);
    // Não aceita mais "código usado recentemente" como passe.
    expect(s).not.toMatch(/\.not\("used_at", "is", null\)/);
  });

  it('a tela envia o código junto com a nova senha', () => {
    const auth = readFileSync(join(__dirname, '..', '..', 'pages', 'Auth.tsx'), 'utf8');
    expect(auth).toMatch(/invoke\('reset-password',\s*\{\s*body: \{ email: normalizedEmail, code:/);
  });
});
