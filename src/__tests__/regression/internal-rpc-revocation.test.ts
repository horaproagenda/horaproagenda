import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'supabase/migrations');
const sql = readFileSync(join(dir, '20261021224142_4fd690fa-e7b3-406b-b7b3-61a5105bc565.sql'), 'utf8');
const appCode = (() => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!p.includes('__tests__') && !p.includes('integrations')) walk(p); }
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(process.cwd(), 'src'));
  return out.join('\n');
})();

const revoked = [...sql.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(n => n.includes('_') && !['link_opened','preview_generated','preview_validated','preview_rejected','value'].includes(n));

describe('internal SECURITY DEFINER functions are not callable by users', () => {
  it('revokes the internal temp password reader', () => {
    expect(revoked).toContain('get_professional_temp_password');
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });
  it('never revokes functions the app still calls', () => {
    for (const keep of ['process_package_session_operation', 'get_seat_usage_report', 'has_role', 'resolve_service_id_for_package']) {
      expect(revoked).not.toContain(keep);
    }
    for (const name of revoked) {
      expect(appCode.includes(`rpc('${name}'`) || appCode.includes(`rpc("${name}"`)).toBe(false);
    }
  });
});
