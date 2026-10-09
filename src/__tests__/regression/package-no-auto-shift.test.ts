import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const report = readFileSync(
  resolve(__dirname, '../../components/client-profile/ClientReportTab.tsx'),
  'utf8',
);

describe('Sessões de pacote nunca mudam de data sozinhas', () => {
  it('abrir o histórico do cliente não recalcula datas', () => {
    expect(report).not.toContain("rpc('repair_client_package_schedule_and_history'");
    expect(report).not.toContain("rpc('recalculate_package_minimum_intervals'");
  });

  it('a última definição do recálculo no banco é passiva (RETURN 0)', () => {
    const dir = resolve(__dirname, '../../../supabase/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let last = '';
    for (const f of files) {
      const sql = readFileSync(resolve(dir, f), 'utf8');
      const m = sql.match(/CREATE OR REPLACE FUNCTION public\.recalculate_package_minimum_intervals[\s\S]*?\$\$;|CREATE OR REPLACE FUNCTION public\.recalculate_package_minimum_intervals[\s\S]*?\$function\$;/g);
      if (m) last = m[m.length - 1];
    }
    expect(last).toMatch(/RETURN 0;\s*END;/);
    expect(last).not.toMatch(/UPDATE public\.appointments/);
  });
});
