import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const allMigrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(migrationsDir, f), 'utf8'));

const latestWith = (needle: string) => {
  for (let i = allMigrations.length - 1; i >= 0; i--) {
    if (allMigrations[i].includes(needle)) return allMigrations[i];
  }
  return '';
};

describe('etapas de pacote sequencial são imutáveis', () => {
  it('existe a trava no banco que fixa etapa e serviço', () => {
    const sql = latestWith('protect_sequential_package_step');
    expect(sql).toMatch(/CREATE TRIGGER trg_protect_sequential_package_step/);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.package_appointments/);
    expect(sql).toMatch(/NEW\.sequence_order := v_step/);
    expect(sql).toMatch(/NEW\.service_id := v_expected/);
  });

  it('a reconstrução de sessões não renumera pacote sequencial', () => {
    const sql = latestWith('CREATE OR REPLACE FUNCTION public.rebuild_package_appointments');
    expect(sql).toMatch(/IF _type = 'sequential' THEN/);
    const sequentialBlock = sql.slice(
      sql.indexOf("IF _type = 'sequential' THEN"),
      sql.indexOf('RETURN _total;'),
    );
    expect(sequentialBlock).not.toMatch(/sequence_order = _seq/);
    expect(sequentialBlock).not.toMatch(/session_number = _seq/);
  });

  it('o serviço da etapa é resolvido pela etapa original, não pela ordem recalculada', () => {
    const sql = latestWith('CREATE OR REPLACE FUNCTION public.heal_package_service_links');
    expect(sql).toMatch(/COALESCE\(pa\.original_session_number, pa\.sequence_order, pa\.session_number\)/);
  });

  it('existem ferramentas de verificação e reparo dos pacotes sequenciais', () => {
    const sql = latestWith('get_sequential_package_integrity_report');
    expect(sql).toMatch(/repair_sequential_package_steps/);
    expect(sql).toMatch(/duplicateSteps/);
    expect(sql).toMatch(/sp\.is_active = true/);
    expect(sql).toMatch(/pa\.appointment_id IS NULL/);
    const repairSql = latestWith('repair_all_sequential_packages');
    expect(repairSql).toMatch(/packagesRepaired/);
    expect(repairSql).toMatch(/recordsChanged/);
  });

  it('a verificação automática está ligada no app', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/useSequentialPackageIntegrityAutoCheck\(\);/);
    const hook = readFileSync(
      resolve(process.cwd(), 'src/hooks/useSequentialPackageIntegrityAutoCheck.ts'),
      'utf8',
    );
    expect(hook).toMatch(/get_sequential_package_integrity_report/);
    expect(hook).toMatch(/repair_all_sequential_packages/);
    expect(hook).toMatch(/recordsChanged > 0/);
    expect(hook).toMatch(/PACKAGE_QUERY_KEYS/);
    expect(hook).not.toMatch(/predicate:\s*\(\) => true/);
  });
});
