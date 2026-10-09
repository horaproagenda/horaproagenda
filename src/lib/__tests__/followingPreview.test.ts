import { describe, it, expect } from 'vitest';
import { buildFollowingPreview } from '../followingPreview';

describe('prévia das sessões seguintes', () => {
  const items = [
    { id: 'a', start_time: '2026-10-19T16:00:00Z' },
    { id: 'b', start_time: '2026-11-16T16:00:00Z' },
    { id: 'c', start_time: '2026-12-14T16:00:00Z', status: 'completed' },
  ];
  it('desloca as seguintes pelo mesmo intervalo, mantendo os dias entre elas', () => {
    const rows = buildFollowingPreview(items, items[0].start_time, new Date('2026-10-21T16:00:00Z'), 'a');
    expect(rows[0].to.toISOString()).toBe('2026-11-18T16:00:00.000Z');
  });
  it('não mexe em sessões concluídas', () => {
    const rows = buildFollowingPreview(items, items[0].start_time, new Date('2026-10-21T16:00:00Z'), 'a');
    expect(rows[1].locked).toBe(true);
    expect(rows[1].to.toISOString()).toBe('2026-12-14T16:00:00.000Z');
  });
});
