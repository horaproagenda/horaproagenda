import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds, tag } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

describeIfCreds('Smoke: pacotes standard e sequential', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;
  const pkgIds: string[] = [];

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    if (pkgIds.length) {
      await c.from('package_appointments').delete().in('package_id', pkgIds);
      await c.from('service_packages').delete().in('id', pkgIds);
    }
    await ctx?.cleanup();
  });

  it('cria pacote standard com saldo de sessões', async () => {
    const { data, error } = await c
      .from('service_packages')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        name: tag('Pacote Std'),
        total_sessions: 3,
        used_sessions: 0,
        package_type: 'standard',
        total_amount: 270,
      })
      .select('id, total_sessions, used_sessions')
      .single();
    expect(error).toBeNull();
    expect(data!.total_sessions).toBe(3);
    pkgIds.push(data!.id);
  });

  it('cria pacote sequential com etapa válida', async () => {
    const { data: pkg, error } = await c
      .from('service_packages')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        name: tag('Pacote Seq'),
        total_sessions: 2,
        used_sessions: 0,
        package_type: 'sequential',
        total_amount: 180,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    pkgIds.push(pkg!.id);

    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { error: stepErr } = await c.from('package_appointments').insert({
      package_id: pkg!.id,
      service_id: ctx.serviceId,
      sequence_order: 1,
      session_number: 1,
      interval_after_days: 7,
      scheduled_date: date,
      status: 'pending',
    });
    expect(stepErr).toBeNull();
  });
});
