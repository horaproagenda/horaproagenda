import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (['__tests__', 'integrations'].includes(f)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

describe('reagendamento único', () => {
  const files = walk(join(__dirname, '..', '..'));

  it('nenhuma tela grava start_time direto nem chama a RPC antiga', () => {
    const offenders = files.filter((f) => {
      if (f.endsWith('rescheduleAppointment.ts')) return false;
      const s = readFileSync(f, 'utf8');
      return /reschedule_package_appointment_safely/.test(s) || /\.update\(\{\s*start_time/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it('a função compartilhada usa a operação do banco', () => {
    const s = readFileSync(join(__dirname, '..', '..', 'lib', 'rescheduleAppointment.ts'), 'utf8');
    expect(s).toContain("rpc('reschedule_appointment'");
  });
});
