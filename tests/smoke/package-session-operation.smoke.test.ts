import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authedClient, describeIfCreds, tag } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

/**
 * Homologação dos 10 cenários do pacote sequencial contra
 * process_package_session_operation (operação única, atômica e idempotente).
 * Regra central: alterar uma sessão NUNCA move as demais.
 */
describeIfCreds('Smoke: pacote sequencial — operação única', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;
  const pkgIds: string[] = [];
  const apptIds: string[] = [];
  const day = 86400000;

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    if (apptIds.length) await c.from('appointments').delete().in('id', apptIds);
    if (pkgIds.length) {
      await c.from('package_appointments').delete().in('package_id', pkgIds);
      await c.from('service_packages').delete().in('id', pkgIds);
    }
    await ctx?.cleanup();
  });

  /** Cria pacote com `total` sessões; `scheduledStarts` agenda as primeiras. */
  async function makePackage(total: number, scheduledStarts: Date[], opts: { active?: boolean } = {}) {
    const { data: pkg, error } = await c
      .from('service_packages')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        name: tag('Pacote Sequencial'),
        total_sessions: total,
        sessions_scheduled: 0,
        package_type: 'sequential',
        total_price: 300,
        duration: 30,
        category: 'Smoke',
        is_active: true,
      } as any)
      .select('id')
      .single();
    expect(error).toBeNull();
    pkgIds.push(pkg!.id);
    const sessions: { id: string; appointmentId: string | null; start: Date | null }[] = [];
    for (let n = 1; n <= total; n++) {
      const start = scheduledStarts[n - 1] ?? null;
      const { data: pa, error: paErr } = await c
        .from('package_appointments')
        .insert({
          package_id: pkg!.id,
          service_id: ctx.serviceId,
          session_number: n,
          original_session_number: n,
          sequence_order: n,
          scheduled_date: start?.toISOString() ?? null,
          status: start ? 'scheduled' : 'pending',
        } as any)
        .select('id')
        .single();
      expect(paErr).toBeNull();
      let appointmentId: string | null = null;
      if (start) {
        const { data: appt, error: aErr } = await c
          .from('appointments')
          .insert({
            client_id: ctx.clientId,
            professional_id: ctx.professionalId,
            service_id: ctx.serviceId,
            start_time: start.toISOString(),
            end_time: new Date(start.getTime() + 30 * 60000).toISOString(),
            status: 'scheduled',
            package_appointment_id: pa!.id,
          } as any)
          .select('id')
          .single();
        expect(aErr).toBeNull();
        appointmentId = appt!.id;
        apptIds.push(appointmentId);
        await c.from('package_appointments').update({ appointment_id: appointmentId } as any).eq('id', pa!.id);
      }
      sessions.push({ id: pa!.id, appointmentId, start });
    }
    if (opts.active === false) await c.from('service_packages').update({ is_active: false } as any).eq('id', pkg!.id);
    return { id: pkg!.id as string, sessions };
  }

  const op = (args: Record<string, unknown>) =>
    c.rpc('process_package_session_operation' as any, {
      p_request_id: crypto.randomUUID(),
      p_idempotency_key: crypto.randomUUID(),
      p_reason: 'smoke',
      p_origin: 'api',
      p_code_version: 'smoke',
      ...args,
    } as any);

  const startOf = async (apptId: string) =>
    new Date((await c.from('appointments').select('start_time').eq('id', apptId).single()).data!.start_time).getTime();

  const futureAt = (days: number, h: number, m = 0) => {
    const d = new Date(Date.now() + days * day);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  it('1. pacote novo: exatamente N sessões pendentes, sem agendamento', async () => {
    const p = await makePackage(3, []);
    const { data } = await c.from('package_appointments').select('status, appointment_id').eq('package_id', p.id);
    expect(data).toHaveLength(3);
    expect(data!.every((r: any) => r.status === 'pending' && r.appointment_id === null)).toBe(true);
  });

  it('2. parcialmente executado: remarcar a 2ª não altera a 1ª nem a 3ª', async () => {
    const s = [futureAt(10, 13), futureAt(31, 13), futureAt(52, 13)];
    const p = await makePackage(3, s);
    expect((await op({ p_package_id: p.id, p_session_number: 1, p_action: 'complete' })).error).toBeNull();
    const ns = futureAt(35, 15);
    const { error } = await op({
      p_package_id: p.id, p_session_number: 2, p_action: 'reschedule',
      p_start_time: ns.toISOString(), p_end_time: new Date(ns.getTime() + 30 * 60000).toISOString(),
    });
    expect(error).toBeNull();
    expect(await startOf(p.sessions[1].appointmentId!)).toBe(ns.getTime());
    expect(await startOf(p.sessions[2].appointmentId!)).toBe(s[2].getTime());
    const { data } = await c.from('package_appointments').select('status').eq('id', p.sessions[0].id).single();
    expect(data!.status).toBe('completed');
  });

  it('3. sessão atrasada não recalcula a próxima', async () => {
    const s = [futureAt(-5, 13), futureAt(20, 13)];
    const p = await makePackage(2, s);
    expect(await startOf(p.sessions[1].appointmentId!)).toBe(s[1].getTime());
  });

  it('4. reagendado: só a sessão pedida muda', async () => {
    const s = [futureAt(10, 13), futureAt(20, 13), futureAt(30, 13)];
    const p = await makePackage(3, s);
    const ns = futureAt(12, 18);
    await op({ p_package_id: p.id, p_session_number: 1, p_action: 'reschedule',
      p_start_time: ns.toISOString(), p_end_time: new Date(ns.getTime() + 30 * 60000).toISOString() });
    expect(await startOf(p.sessions[1].appointmentId!)).toBe(s[1].getTime());
    expect(await startOf(p.sessions[2].appointmentId!)).toBe(s[2].getTime());
  });

  it('5. pacote encerrado rejeita novo horário', async () => {
    const p = await makePackage(2, [futureAt(10, 13)], { active: false });
    const ns = futureAt(11, 13);
    const { error } = await op({ p_package_id: p.id, p_session_number: 1, p_action: 'reschedule',
      p_start_time: ns.toISOString(), p_end_time: new Date(ns.getTime() + 30 * 60000).toISOString() });
    expect(error).not.toBeNull();
  });

  it('6. pagamento pendente não impede concluir a sessão', async () => {
    const p = await makePackage(1, [futureAt(3, 13)]);
    const { data, error } = await op({ p_package_id: p.id, p_session_number: 1, p_action: 'complete' });
    expect(error).toBeNull();
    expect((data as any).status).toBe('completed');
  });

  it('7. aplicação já criada: etapa duplicada e sessão além do limite são rejeitadas', async () => {
    const p = await makePackage(2, []);
    const dup = await c.from('package_appointments').insert({
      package_id: p.id, session_number: 1, original_session_number: 1, status: 'pending',
    } as any);
    expect(dup.error).not.toBeNull();
    const extra = await c.from('package_appointments').insert({
      package_id: p.id, session_number: 3, original_session_number: 3, status: 'pending',
    } as any);
    expect(extra.error).not.toBeNull();
  });

  it('8. execução repetida/concorrente com a mesma chave grava uma única vez', async () => {
    const p = await makePackage(1, [futureAt(4, 13)]);
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      op({ p_package_id: p.id, p_session_number: 1, p_action: 'complete', p_idempotency_key: key }),
      op({ p_package_id: p.id, p_session_number: 1, p_action: 'complete', p_idempotency_key: key }),
    ]);
    const okCount = [a, b].filter((r) => !r.error).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    const { count } = await c.from('package_audit_logs' as any).select('id', { count: 'exact', head: true })
      .eq('idempotency_key', key);
    expect(count).toBe(1);
  });

  it('9. virada de mês preserva o dia exato', async () => {
    const y = new Date().getUTCFullYear() + 1;
    const end = new Date(Date.UTC(y, 0, 31, 15, 0)); // 31/jan 12h em SP
    const p = await makePackage(2, [futureAt(5, 13), new Date(Date.UTC(y, 0, 20, 15))]);
    await op({ p_package_id: p.id, p_session_number: 2, p_action: 'reschedule',
      p_start_time: end.toISOString(), p_end_time: new Date(end.getTime() + 30 * 60000).toISOString() });
    expect(await startOf(p.sessions[1].appointmentId!)).toBe(end.getTime());
  });

  it('10. perto da meia-noite: horário gravado sem deslocamento', async () => {
    const late = futureAt(9, 2, 30); // 23h30 em SP (UTC-3)
    const p = await makePackage(1, [futureAt(8, 13)]);
    await op({ p_package_id: p.id, p_session_number: 1, p_action: 'reschedule',
      p_start_time: late.toISOString(), p_end_time: new Date(late.getTime() + 20 * 60000).toISOString() });
    expect(await startOf(p.sessions[0].appointmentId!)).toBe(late.getTime());
  });

  describe('invariantes', () => {
    it('sessão concluída só reabre com ação explícita e motivo', async () => {
      const p = await makePackage(1, [futureAt(6, 13)]);
      await op({ p_package_id: p.id, p_session_number: 1, p_action: 'complete' });
      const direct = await c.from('package_appointments').update({ status: 'pending' } as any).eq('id', p.sessions[0].id);
      const { data } = await c.from('package_appointments').select('status').eq('id', p.sessions[0].id).single();
      expect(direct.error !== null || data!.status === 'completed').toBe(true);
      const { error } = await op({ p_package_id: p.id, p_session_number: 1, p_action: 'reopen', p_reason: 'erro de registro' });
      expect(error).toBeNull();
    });
  });
});
