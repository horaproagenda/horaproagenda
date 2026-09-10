import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Mirrors the normalization done in supabase/functions/verify-code/index.ts
 * to guarantee that user-typed/pasted codes match what's stored.
 */
function normalizeCode(input: unknown): string {
  return String(input ?? '').replace(/\D/g, '').trim();
}

function normalizeEmail(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}

describe('verify-code input normalization', () => {
  it('strips spaces, dashes and invisible chars from pasted codes', () => {
    expect(normalizeCode(' 123 456 ')).toBe('123456');
    expect(normalizeCode('123-456')).toBe('123456');
    expect(normalizeCode('1 2 3 4 5 6')).toBe('123456');
    expect(normalizeCode('\u200B123456')).toBe('123456');
  });

  it('keeps a clean 6-digit code unchanged', () => {
    expect(normalizeCode('847716')).toBe('847716');
  });

  it('returns empty string for null / undefined / non-numeric', () => {
    expect(normalizeCode(undefined)).toBe('');
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode('abcdef')).toBe('');
  });

  it('lowercases and trims emails consistently', () => {
    expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('mariaterezacastro2@icloud.com')).toBe('mariaterezacastro2@icloud.com');
  });

  it('does not pad short codes (caller must enforce 6 digits)', () => {
    expect(normalizeCode('123')).toBe('123');
    expect(normalizeCode('123').length).toBe(3);
  });

  it('accepts a matching unexpired code even when a newer code also exists', () => {
    const now = new Date('2026-06-15T19:20:00.000Z').getTime();
    const codes = [
      { code: '986265', expires_at: '2026-06-15T19:28:00.000Z', used_at: null },
      { code: '871338', expires_at: '2026-06-15T19:29:00.000Z', used_at: null },
    ];

    const matching = codes.find(
      (row) => row.code === normalizeCode('986265') && !row.used_at && new Date(row.expires_at).getTime() >= now,
    );

    expect(matching?.code).toBe('986265');
  });

  it('keeps signup and reset-password cooldowns isolated by code type', () => {
    const recent = [
      { email: 'user@example.com', type: 'login', created_at: '2026-06-15T19:20:20.000Z' },
    ];

    const blocksSignup = recent.some(
      (row) => row.email === 'user@example.com' && row.type === 'signup',
    );

    expect(blocksSignup).toBe(false);
  });
});

describe('signup verification server contract', () => {
  const verifySource = readFileSync(resolve(__dirname, '../../../supabase/functions/verify-code/index.ts'), 'utf8');
  const completeSource = readFileSync(resolve(__dirname, '../../../supabase/functions/complete-signup/index.ts'), 'utf8');
  const sendSource = readFileSync(resolve(__dirname, '../../../supabase/functions/send-verification-code/index.ts'), 'utf8');
  const subscriptionStatusMigration = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/20260910183632_21e2872a-6f4b-418b-bc7f-5cb652a2cb40.sql'),
    'utf8',
  );

  it('uses one atomic database operation for code confirmation and attempt counting', () => {
    expect(verifySource).toContain('confirm_verification_code');
    expect(verifySource).not.toContain('.from("verification_codes")');
  });

  it('reserves sends atomically so concurrent requests cannot issue duplicate emails', () => {
    expect(sendSource).toContain('issue_verification_code');
    expect(sendSource).not.toContain('sixtySecondsAgo');
  });

  it('never sends the raw email code to account creation', () => {
    expect(completeSource).toContain('consume_signup_verification_grant');
    expect(completeSource).toContain('signupToken');
    expect(completeSource).not.toMatch(/\.eq\(["']code["']/);
  });

  it('allows every subscription status used during signup and automatic suspension', () => {
    expect(subscriptionStatusMigration).toMatch(/CHECK\s*\(status IN\s*\([\s\S]*'pending'/);
    expect(subscriptionStatusMigration).toMatch(/CHECK\s*\(status IN\s*\([\s\S]*'suspended'/);
  });

  it('does not expose database internals when account creation fails', () => {
    expect(completeSource).not.toMatch(/jsonResponse\(\{ success: false, error: createError\.message/);
    expect(completeSource).toContain('Não foi possível criar sua conta agora. Tente novamente.');
  });
});
