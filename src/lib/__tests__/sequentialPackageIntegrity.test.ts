import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSequentialSchedule } from '@/lib/sequentialPackageSchedule';
import { buildSequentialServiceColorMap, SEQUENTIAL_SERVICE_PALETTE } from '@/lib/sequentialPackageColors';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('paleta do pacote sequencial', () => {
  it('não repete cores entre posições da paleta', () => {
    const keys = SEQUENTIAL_SERVICE_PALETTE.map(c => `${c.bg}|${c.text}|${c.dot}|${c.border}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('dá cores diferentes para serviços diferentes', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `svc-${i}`);
    const map = buildSequentialServiceColorMap(ids);
    const dots = ids.map(id => map.get(id)!.dot);
    expect(new Set(dots).size).toBe(ids.length);
  });

  it('reaproveita a mesma cor para o mesmo serviço repetido', () => {
    const map = buildSequentialServiceColorMap(['a', 'b', 'a']);
    expect(map.get('a')!.dot).not.toBe(map.get('b')!.dot);
    expect(map.size).toBe(2);
  });
});

describe('cadeia de datas do pacote sequencial', () => {
  it('respeita o intervalo de cada etapa começando em data passada', () => {
    const steps = Array.from({ length: 15 }, (_, i) => ({
      service_id: `svc-${i % 3}`,
      interval_after_days: (i % 3) + 5, // 5, 6, 7, 5, ...
      duration_minutes: 60,
    }));
    const services = [0, 1, 2].map(i => ({ id: `svc-${i}`, name: `Serviço ${i}`, duration: 60 }));

    const out = buildSequentialSchedule({
      steps,
      services,
      pkg: { name: 'Corpo inteiro', total_sessions: 15 } as any,
      startDate: '2026-08-19',
      startTime: '18:00',
    });

    expect(out).toHaveLength(15);
    expect(out[0].date).toBe('2026-08-19');
    expect(out[0].startTime).toBe('18:00');
    expect(out[0].endTime).toBe('19:00');

    const dayDiff = (a: string, b: string) =>
      Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

    for (let i = 1; i < out.length; i++) {
      expect(dayDiff(out[i - 1].date, out[i].date)).toBe(steps[i - 1].interval_after_days);
    }
  });
});

describe('nenhuma rotina em segundo plano apaga pacotes agendados', () => {
  it('a verificação de fluxo de venda não chama exclusões', () => {
    const src = read('src/hooks/useSaleFlowIntegrityAutoCheck.ts');
    expect(src).not.toMatch(/heal_orphan_service_packages/);
    expect(src).not.toMatch(/hard_purge_service_package/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it('o vínculo da sessão reverte o agendamento em caso de falha', () => {
    const src = read('src/components/appointments/NewAppointmentDialog.tsx');
    const rollbacks = src.match(/catch \(linkError\)/g) || [];
    expect(rollbacks.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/package_appointments'\)\s*\n?\s*\.select\('appointment_id'\)/);
  });
});
