import { afterAll, beforeAll, expect, it } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { authedClient, describeIfCreds } from './setup';

/**
 * Verifies that get_effective_business_settings correctly overlays a
 * professional's personal preferences on top of global business_settings,
 * and that clearing the override returns the global value.
 */
describeIfCreds('preferences overlay (get_effective_business_settings)', () => {
  let c: SupabaseClient;
  let userId: string;
  let originalOpening: string | null = null;

  beforeAll(async () => {
    c = await authedClient();
    const { data: u } = await c.auth.getUser();
    userId = u.user!.id;
    const { data: existing } = await c
      .from('professional_preferences')
      .select('opening_time')
      .eq('user_id', userId)
      .maybeSingle();
    originalOpening = (existing?.opening_time as string | null) ?? null;
  });

  afterAll(async () => {
    // Restore original state
    await c
      .from('professional_preferences')
      .upsert({ user_id: userId, opening_time: originalOpening }, { onConflict: 'user_id' });
  });

  it('returns global settings when no override is set', async () => {
    await c
      .from('professional_preferences')
      .upsert({ user_id: userId, opening_time: null }, { onConflict: 'user_id' });

    const { data: global } = await c
      .from('business_settings')
      .select('opening_time')
      .limit(1)
      .maybeSingle();

    const { data: eff, error } = await c.rpc('get_effective_business_settings');
    expect(error).toBeNull();
    expect(eff).toBeTruthy();
    const e = eff as Record<string, any>;
    expect(e.opening_time?.substring(0, 5)).toBe(
      (global?.opening_time as string | undefined)?.substring(0, 5),
    );
    expect(e.has_override).toBe(false);
  });

  it('overlays personal opening_time over global', async () => {
    await c
      .from('professional_preferences')
      .upsert({ user_id: userId, opening_time: '06:30:00' }, { onConflict: 'user_id' });

    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    expect(e.opening_time?.substring(0, 5)).toBe('06:30');
    expect(e.has_override).toBe(true);
  });

  it('falls back to global when override is cleared', async () => {
    await c
      .from('professional_preferences')
      .upsert({ user_id: userId, opening_time: null }, { onConflict: 'user_id' });

    const { data: global } = await c
      .from('business_settings')
      .select('opening_time')
      .limit(1)
      .maybeSingle();
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    expect(e.opening_time?.substring(0, 5)).toBe(
      (global?.opening_time as string | undefined)?.substring(0, 5),
    );
  });

  it('preserves global keys not overridden (slot_interval)', async () => {
    const { data: global } = await c
      .from('business_settings')
      .select('slot_interval')
      .limit(1)
      .maybeSingle();
    const { data: eff } = await c.rpc('get_effective_business_settings');
    const e = eff as Record<string, any>;
    expect(e.slot_interval).toBe(global?.slot_interval);
  });
});
