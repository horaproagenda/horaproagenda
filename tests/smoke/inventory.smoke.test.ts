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

    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const { data: appt, error } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        scheduled_date: date,
        scheduled_time: '09:00',
        duration_minutes: 30,
        status: 'scheduled',
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    await c.from('appointments').update({ status: 'completed' }).eq('id', appt!.id);

    const { data: after } = await c
      .from('products')
      .select('current_stock')
      .eq('id', ctx.productId)
      .single();

    expect(after!.current_stock).toBe(before!.current_stock - 2);
  });
});
