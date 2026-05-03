import { describe, it, expect } from 'vitest';
import { findSchedulingConflict, findNextAvailablePackageSlot, isServiceCompatibleWithPackage, overlapsTimeRange } from './packageScheduling';

const apt = (start: string, end: string, opts: Partial<{ id: string; professional_id: string; room_id: string; status: string }> = {}) => ({
  id: opts.id ?? `a-${start}`,
  start_time: start,
  end_time: end,
  professional_id: opts.professional_id ?? null,
  room_id: opts.room_id ?? null,
  status: opts.status ?? 'scheduled',
});

describe('packageScheduling', () => {
  it('overlapsTimeRange detecta sobreposição correta', () => {
    const a = new Date('2026-05-10T09:00:00');
    const b = new Date('2026-05-10T10:00:00');
    expect(overlapsTimeRange(a, b, new Date('2026-05-10T09:30:00'), new Date('2026-05-10T10:30:00'))).toBe(true);
    expect(overlapsTimeRange(a, b, new Date('2026-05-10T10:00:00'), new Date('2026-05-10T11:00:00'))).toBe(false);
  });

  it('encontra conflito por profissional', () => {
    const conflict = findSchedulingConflict(
      new Date('2026-05-10T09:30:00'),
      30,
      [apt('2026-05-10T09:00:00', '2026-05-10T10:00:00', { professional_id: 'p1' })],
      { professional_id: 'p1' },
    );
    expect(conflict).toBeDefined();
  });

  it('ignora agendamentos cancelados', () => {
    const conflict = findSchedulingConflict(
      new Date('2026-05-10T09:30:00'),
      30,
      [apt('2026-05-10T09:00:00', '2026-05-10T10:00:00', { professional_id: 'p1', status: 'cancelled' })],
      { professional_id: 'p1' },
    );
    expect(conflict).toBeUndefined();
  });

  it('ignora IDs informados em ignoreAppointmentIds', () => {
    const conflict = findSchedulingConflict(
      new Date('2026-05-10T09:30:00'),
      30,
      [apt('2026-05-10T09:00:00', '2026-05-10T10:00:00', { id: 'self', professional_id: 'p1' })],
      { professional_id: 'p1', ignoreAppointmentIds: ['self'] },
    );
    expect(conflict).toBeUndefined();
  });

  it('findNextAvailablePackageSlot pula para após o conflito', () => {
    const next = findNextAvailablePackageSlot(
      new Date('2026-05-10T09:00:00'),
      30,
      [apt('2026-05-10T09:00:00', '2026-05-10T10:00:00', { professional_id: 'p1' })],
      { professional_id: 'p1' },
    );
    expect(next.getTime()).toBeGreaterThanOrEqual(new Date('2026-05-10T10:15:00').getTime());
  });

  it('isServiceCompatibleWithPackage valida profissional/sala', () => {
    expect(isServiceCompatibleWithPackage({ professional_id: 'p1' }, { professional_id: 'p1' })).toBe(true);
    expect(isServiceCompatibleWithPackage({ professional_id: 'p2' }, { professional_id: 'p1' })).toBe(false);
    expect(isServiceCompatibleWithPackage(undefined, {})).toBe(false);
  });
});
