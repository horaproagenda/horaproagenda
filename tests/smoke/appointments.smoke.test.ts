import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

function plusDaysAt(days: number, hour: number, minute = 0) {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d;
}

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
    const start = plusDaysAt(1, 10);
    const end = new Date(start.getTime() + 30 * 60_000);
    const { data, error } = await c
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
    expect(data?.id).toBeTruthy();
  });

  it('edita e cancela agendamento', async () => {
    const start = plusDaysAt(2, 14);
    const end = new Date(start.getTime() + 30 * 60_000);
    const { data: appt } = await c
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

    const newStart = plusDaysAt(2, 15);
    const newEnd = new Date(newStart.getTime() + 30 * 60_000);
    const { error: updErr } = await c
      .from('appointments')
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq('id', appt!.id);
    expect(updErr).toBeNull();

    const { error: cancelErr } = await c
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt!.id);
    expect(cancelErr).toBeNull();
  });
});
