import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// A anotação de privacidade precisa usar um tipo aceito por audit_logs
// (INSERT/UPDATE/DELETE); 'visibility_change' como action fazia o salvamento falhar.
describe('auditoria de privacidade', () => {
  it('a última definição de tg_audit_visibility_change grava action UPDATE', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).sort();
    let last = '';
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8');
      const i = sql.lastIndexOf('FUNCTION public.tg_audit_visibility_change');
      if (i >= 0) last = sql.slice(i, sql.indexOf('$$;', i));
    }
    expect(last).toContain("'UPDATE'");
    expect(last).not.toMatch(/NEW\.id,\s*\n?\s*'visibility_change'|auth\.uid\(\),\s*'visibility_change'/);
  });
});
