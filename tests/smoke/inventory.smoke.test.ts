import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

describeIfCreds('Smoke: estoque decrementa ao concluir agendamento', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('reduz estoque conforme quantity_per_use ao marcar como completed', async () => {
    const { data: before } = await c
      .from('products')
      .select('current_stock')
      .eq('id', ctx.productId)
      .single();

    const start = new Date(Date.now() + 3 * 86400000);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    const { data: appt, error } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'scheduled',
        payment_status: 'pending',
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    await c.from('appointments').update({ status: 'completed' }).eq('id', appt!.id);
    await new Promise((r) => setTimeout(r, 600));

    const { data: after } = await c
      .from('products')
      .select('current_stock')
      .eq('id', ctx.productId)
      .single();

    expect(after!.current_stock).toBe(Number(before!.current_stock) - 2);
  });
});
