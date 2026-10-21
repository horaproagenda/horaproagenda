import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authedClient, describeIfCreds } from './setup';
import { bootstrap, SmokeContext } from './fixtures';
import { listenForAppointmentInsert } from './integrityHelpers';

describeIfCreds('Smoke: realtime postgres_changes em appointments', () => {
  let writer: Awaited<ReturnType<typeof authedClient>>;
  let listener: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;

  beforeAll(async () => {
    writer = await authedClient();
    listener = await authedClient();
    const { data, error } = await listener.auth.getSession();
    if (error || !data.session) throw new Error('Listener Realtime sem sessão autenticada.');
    await listener.realtime.setAuth(data.session.access_token);
    ctx = await bootstrap(writer);
  });

  afterAll(async () => {
    await listener?.removeAllChannels();
    await ctx?.cleanup();
  });

  it('recebe INSERT após a assinatura Realtime', async () => {
    const appointmentId = randomUUID();
    const subscription = await listenForAppointmentInsert(listener, appointmentId);

    // P0001 = o banco recusou por choque de horário. Usa um dia útil distante e
    // aleatório para não colidir com os agendamentos dos outros testes.
    const start = new Date(Date.now() + (30 + Math.floor(Math.random() * 60)) * 86400000);
    while (start.getDay() === 0 || start.getDay() === 6) start.setDate(start.getDate() + 1);
    start.setHours(10 + Math.floor(Math.random() * 6), 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    try {
    const { error: insertError } = await writer.from('appointments').insert({
      id: appointmentId,
      client_id: ctx.clientId,
      professional_id: ctx.professionalId,
      service_id: ctx.serviceId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      payment_status: 'pending',
    });

    if (insertError) throw insertError;
    expect(insertError).toBeNull();

    expect(await subscription.received).toBe(appointmentId);
    const { data: saved, error: readError } = await listener.from('appointments').select('id').eq('id', appointmentId).single();
    expect(readError).toBeNull();
    expect(saved?.id).toBe(appointmentId);
    } finally {
      await subscription.dispose();
    }
  }, 35000);
});
