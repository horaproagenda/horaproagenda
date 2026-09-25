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
    const { error } = await listener.auth.signInWithPassword({
      email: process.env.SMOKE_TEST_EMAIL!,
      password: process.env.SMOKE_TEST_PASSWORD!,
    });
    if (error) throw new Error(`Falha no login do listener Realtime: ${error.message}`);
    ctx = await bootstrap(writer);
  });

  afterAll(async () => {
    await ctx?.cleanup();
    await listener?.removeAllChannels();
  });

  it('recebe INSERT após a assinatura Realtime', async () => {
    let resolveReceived!: (ok: boolean) => void;
    const received = new Promise<boolean>((resolve) => {
      resolveReceived = resolve;
    });

    const ch = listener
      .channel(`smoke-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments' },
        (payload: any) => {
          if (payload.new?.client_id === ctx.clientId) resolveReceived(true);
        },
      );

    // Aguarda a confirmação explícita de SUBSCRIBED antes de inserir,
    // evitando falso negativo por corrida de assinatura.
    await new Promise<void>((resolve, reject) => {
      const subTimer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 15000);
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(subTimer);
          resolve();
        }
      });
    });

    // O prazo de entrega começa somente depois que o servidor confirmou a assinatura.
    const timer = setTimeout(() => resolveReceived(false), 15000);

    const start = new Date(Date.now() + 5 * 86400000);
    start.setHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    const { error: insertError } = await writer.from('appointments').insert({
      client_id: ctx.clientId,
      professional_id: ctx.professionalId,
      service_id: ctx.serviceId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      payment_status: 'pending',
    });
    expect(insertError).toBeNull();

    const ok = await received;
    clearTimeout(timer);
    expect(ok).toBe(true);
  }, 35000);
});
