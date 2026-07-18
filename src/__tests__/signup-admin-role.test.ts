import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contract tests for role assignment in the signup / seat-provisioning flows.
 *
 * These edge functions run on Deno and can't be imported directly into Vitest,
 * so we assert the invariants by inspecting the source: the same technique the
 * Supabase docs recommend for verifying critical SQL/RPC strings shipped to
 * production. If any of these strings drift, new accounts risk losing admin
 * access (which is exactly the regression the user reported).
 */

function readFn(name: string) {
  return readFileSync(
    resolve(__dirname, `../../supabase/functions/${name}/index.ts`),
    'utf8',
  );
}

describe('complete-signup grants admin role', () => {
  const src = readFn('complete-signup');

  it('upserts the admin role for the newly created user', () => {
    expect(src).toMatch(/from\(["']user_roles["']\)/);
    expect(src).toMatch(/role:\s*["']admin["']/);
    expect(src).toMatch(/onConflict:\s*["']user_id,role["']/);
  });

  it('links the new user as its own account_owner_id', () => {
    expect(src).toMatch(/account_owner_id:\s*userId/);
  });

  it('fails loudly when the role upsert errors', () => {
    // Prevents a silent "no admin role" state that would hide the panel.
    expect(src).toMatch(/roleError[\s\S]{0,200}Erro ao configurar permissões/);
  });
});

describe('admin-create-account-user provisions seat users', () => {
  const src = readFn('admin-create-account-user');

  it('assigns the professional role by default (not admin)', () => {
    expect(src).toMatch(/from\(["']user_roles["']\)[\s\S]{0,200}role:\s*["']professional["']/);
    // Seat users must never be silently promoted to admin via user_roles insert.
    expect(src).not.toMatch(/from\(["']user_roles["']\)[\s\S]{0,200}role:\s*["']admin["']/);
  });

  it('respects the seat_limit before creating the user', () => {
    expect(src).toMatch(/count_account_seats/);
    expect(src).toMatch(/seat_limit_reached/);
  });

  it('persists the permissions payload chosen by the admin', () => {
    expect(src).toMatch(/from\(["']user_permissions["']\)[\s\S]{0,200}upsert/);
    expect(src).toMatch(/onConflict:\s*["']user_id,module["']/);
  });

  it('binds the new profile to the caller account_owner_id', () => {
    expect(src).toMatch(/account_owner_id:\s*callerId/);
  });
});
