import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Garante que a função usada pelo teste de integridade de assentos existe e
// continua liberada para usuários logados (e fechada para visitantes).
describe('get_seat_usage_report migration', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const all = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  it('cria a função', () => {
    expect(all).toMatch(/CREATE OR REPLACE FUNCTION public\.get_seat_usage_report\(\)/);
  });

  it('libera execução para authenticated e revoga de anon', () => {
    expect(all).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_seat_usage_report\(\) TO authenticated/);
    expect(all).toMatch(/REVOKE ALL ON FUNCTION public\.get_seat_usage_report\(\) FROM PUBLIC, anon/);
  });

  it('nenhuma migração posterior revoga de authenticated', () => {
    expect(all).not.toMatch(/REVOKE[^;]*get_seat_usage_report[^;]*authenticated/i);
  });
});
