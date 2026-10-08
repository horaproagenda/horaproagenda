import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('produto em modo estimado', () => {
  it('não é abatido a cada atendimento concluído, só no término do ciclo', () => {
    const sql = readFileSync('supabase/migrations/20261008202104_affae607-c411-46f7-b70b-ff1beee5eea0.sql', 'utf8');
    expect(sql).toMatch(/WHEN l\.tracking_method = 'estimated' THEN 0/);
  });
});
