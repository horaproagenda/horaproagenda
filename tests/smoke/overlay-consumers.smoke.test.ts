import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { authedClient, describeIfCreds } from './setup';

/**
 * Verifies that the per-professional overlay flowing through
 * `get_effective_business_settings` is consumed correctly by:
 *   - Agenda time-slot generator (opening_time / closing_time / slot_interval)
 *   - useReminderNotifications cash-register close warning (closing_time)
 *   - GapFinderPanel window (opening_time / closing_time)
 *   - OccupancyDashboard window (opening_time / closing_time)
 *
 * The hooks all read from the same overlaid `business_settings`, so the
 * RPC is the source of truth. Each test mirrors how the consumer uses
 * the fields, and asserts the per-user override takes precedence.
 */

const OVERRIDE_OPENING = '07:15:00';
const OVERRIDE_CLOSING = '21:45:00';
const OVERRIDE_SLOT = 45;

function generateSlots(start: string, end: string, interval: number): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let h = sh, m = sm;
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += interval;
    if (m >= 60) { h += Math.floor(m / 60); m %= 60; }
  }
  return slots;
}

describeIfCreds('overlay consumers (agenda + reminders + gap + occupancy)', () => {
  let c: SupabaseClient;
  let userId: string;
  let original: any = null;

  beforeAll(async () => {
    c = await authedClient();
    const { data: u } = await c.auth.getUser();
    userId = u.user!.id;
    const { data } = await c
      .from('professional_preferences')
      .select('opening_time, closing_time, slot_interval')
      .eq('user_id', userId)
      .maybeSingle();
    original = data ?? null;

    await c.from('professional_preferences').upsert(
      {
        user_id: userId,
        opening_time: OVERRIDE_OPENING,
        closing_time: OVERRIDE_CLOSING,
        slot_interval: OVERRIDE_SLOT,
      },
      { onConflict: 'user_id' },
    );
  });

  afterAll(async () => {
    await c.from('professional_preferences').upsert(
      {
        user_id: userId,
        opening_time: original?.opening_time ?? null,
        closing_time: original?.closing_time ?? null,
        slot_interval: original?.slot_interval ?? null,
      },
      { onConflict: 'user_id' },
    );
  });

  it('Agenda: generates slots from overridden opening/closing/interval', async () => {
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    const open = (e.opening_time as string).substring(0, 5);
    const close = (e.closing_time as string).substring(0, 5);
    expect(open).toBe(OVERRIDE_OPENING.substring(0, 5));
    expect(close).toBe(OVERRIDE_CLOSING.substring(0, 5));
    expect(e.slot_interval).toBe(OVERRIDE_SLOT);

    const slots = generateSlots(open, close, e.slot_interval);
    expect(slots[0]).toBe('07:15');
    expect(slots).toContain('08:00');
    expect(slots).toContain('21:00');
    expect(slots[slots.length - 1] < '21:45').toBe(true);
  });

  it('useReminderNotifications: closing time used for cash-close warning matches override', async () => {
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    // The hook does: settings.closing_time.substring(0, 5)
    const closing = (e.closing_time as string).substring(0, 5);
    expect(closing).toBe('21:45');
    // 15-minute warning derives from that exact value
    const [h, m] = closing.split(':').map(Number);
    const warnMin = (h * 60 + m) - 15;
    expect(warnMin).toBe(21 * 60 + 30);
  });

  it('GapFinderPanel: business-day window respects override', async () => {
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    const [oh, om] = (e.opening_time as string).split(':').map(Number);
    const [ch, cm] = (e.closing_time as string).split(':').map(Number);
    expect(oh * 60 + om).toBe(7 * 60 + 15);
    expect(ch * 60 + cm).toBe(21 * 60 + 45);
    expect((ch * 60 + cm) - (oh * 60 + om)).toBe(14 * 60 + 30); // ~14h30
  });

  it('OccupancyDashboard: total capacity minutes/day uses overridden window', async () => {
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    const [oh, om] = (e.opening_time as string).split(':').map(Number);
    const [ch, cm] = (e.closing_time as string).split(':').map(Number);
    const capacityMin = (ch * 60 + cm) - (oh * 60 + om);
    expect(capacityMin).toBeGreaterThan(8 * 60); // overridden window > default 12h - 4h
    expect(capacityMin).toBe(870);
  });
});
