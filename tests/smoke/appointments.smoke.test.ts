import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

describeIfCreds('Smoke: agendamentos (criação, edição, cancelamento)', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('cria agendamento', async () => {
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { data, error } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        scheduled_date: date,
        scheduled_time: '10:00',
        duration_minutes: 30,
        status: 'scheduled',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it('edita e cancela agendamento', async () => {
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const { data: appt } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        scheduled_date: date,
        scheduled_time: '14:00',
        duration_minutes: 30,
        status: 'scheduled',
      })
      .select('id')
      .single();

    const { error: updErr } = await c
      .from('appointments')
      .update({ scheduled_time: '15:00' })
      .eq('id', appt!.id);
    expect(updErr).toBeNull();

    const { error: cancelErr } = await c
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt!.id);
    expect(cancelErr).toBeNull();
  });
});
