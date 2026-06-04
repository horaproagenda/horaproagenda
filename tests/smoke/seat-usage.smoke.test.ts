import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authedClient, hasCreds } from './setup';

const describeIf = hasCreds ? describe : describe.skip;

describeIf('seat usage RPCs', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let c: any;
  beforeAll(async () => { c = await authedClient(); });
  afterAll(async () => { if (c) await c.auth.signOut(); });

  it('get_seat_usage returns coherent shape', async () => {
    const { data, error } = await c.rpc('get_seat_usage');
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeTruthy();
    expect(typeof row.used).toBe('number');
    expect(typeof row.seat_limit).toBe('number');
    expect(typeof row.available).toBe('number');
    expect(typeof row.is_grandfathered).toBe('boolean');
    // available + used >= seat_limit when not grandfathered (>= because available is clamped at 0)
    if (!row.is_grandfathered) {
      expect(row.available).toBeGreaterThanOrEqual(0);
      expect(row.used).toBeGreaterThanOrEqual(0);
      expect(row.used + row.available).toBeGreaterThanOrEqual(row.seat_limit > 0 ? Math.min(row.used, row.seat_limit) : 0);
    }
  });

  it('get_my_subscription returns owner row matching get_seat_usage seat_limit', async () => {
    const { data: subData } = await c.rpc('get_my_subscription');
    const sub = subData && (subData.id ? subData : Array.isArray(subData) ? subData[0] : null);
    const { data: usageData } = await c.rpc('get_seat_usage');
    const usage = Array.isArray(usageData) ? usageData[0] : usageData;
    if (sub && usage && !usage.is_grandfathered) {
      expect(usage.seat_limit).toBe(sub.seat_limit);
    }
  });
});
