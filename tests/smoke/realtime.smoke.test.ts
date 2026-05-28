import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds, makeClient } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

describeIfCreds('Smoke: realtime postgres_changes em appointments', () => {
  let writer: Awaited<ReturnType<typeof authedClient>>;
  let listener: ReturnType<typeof makeClient>;
  let ctx: SmokeContext;

  beforeAll(async () => {
    writer = await authedClient();
    listener = makeClient();
    await listener.auth.signInWithPassword({
      email: process.env.SMOKE_TEST_EMAIL!,
      password: process.env.SMOKE_TEST_PASSWORD!,
    });
    ctx = await bootstrap(writer);
  });

  afterAll(async () => {
    await ctx?.cleanup();
    await listener.removeAllChannels();
  });

  it('recebe INSERT em < 5s', async () => {
    const received = new Promise<boolean>((resolve) => {
      const ch = listener
        .channel(`smoke-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'appointments' },
          (payload: any) => {
            if (payload.new?.client_id === ctx.clientId) resolve(true);
          },
        )
        .subscribe();
      setTimeout(() => resolve(false), 5000);
      return ch;
    });

    // Give listener time to subscribe
    await new Promise((r) => setTimeout(r, 1500));

    const start = new Date(Date.now() + 5 * 86400000);
    start.setHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    await writer.from('appointments').insert({
      client_id: ctx.clientId,
      professional_id: ctx.professionalId,
      service_id: ctx.serviceId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      payment_status: 'pending',
    });

    const ok = await received;
    expect(ok).toBe(true);
  });
});
