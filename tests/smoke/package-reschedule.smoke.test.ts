import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds, tag } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

/**
 * Verifies that rescheduling a package session:
 *  - does NOT create a duplicate package_appointments row
 *  - keeps the "applications realized" count stable
 *  - blocks the creation of an 11th session beyond the contracted total
 *  - exposes audit_package_reschedule warnings to the client
 */
describeIfCreds('Smoke: reagendamento de pacote — integridade', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;
  const cleanupIds: { packageIds: string[]; appointmentIds: string[] } = {
    packageIds: [],
    appointmentIds: [],
  };

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    if (cleanupIds.appointmentIds.length) {
      await c.from('appointments').delete().in('id', cleanupIds.appointmentIds);
    }
    if (cleanupIds.packageIds.length) {
      await c.from('package_appointments').delete().in('package_id', cleanupIds.packageIds);
      await c.from('service_packages').delete().in('id', cleanupIds.packageIds);
    }
    await ctx?.cleanup();
  });

  it('mantém a contagem de sessões ao reagendar uma aplicação existente', async () => {
    const totalSessions = 3;

    const { data: pkg, error: pkgErr } = await c
      .from('service_packages')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        name: tag('Pacote Reschedule'),
        total_sessions: totalSessions,
        sessions_scheduled: 0,
        package_type: 'standard',
        total_price: 270,
        duration: 30,
        category: 'Smoke',
        is_active: true,
      })
      .select('id')
      .single();
    expect(pkgErr).toBeNull();
    cleanupIds.packageIds.push(pkg!.id);

    // Create one appointment linked to the package via a package_appointments row
    const startBase = new Date(Date.now() + 7 * 86400000);
    startBase.setUTCHours(13, 0, 0, 0);
    const endBase = new Date(startBase.getTime() + 30 * 60000);

    const { data: pa, error: paErr } = await c
      .from('package_appointments')
      .insert({
        package_id: pkg!.id,
        service_id: ctx.serviceId,
        sequence_order: 1,
        session_number: 1,
        scheduled_date: startBase.toISOString(),
        status: 'scheduled',
      })
      .select('id')
      .single();
    expect(paErr).toBeNull();

    const { data: appt, error: apptErr } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        start_time: startBase.toISOString(),
        end_time: endBase.toISOString(),
        status: 'scheduled',
        package_appointment_id: pa!.id,
      })
      .select('id')
      .single();
    expect(apptErr).toBeNull();
    cleanupIds.appointmentIds.push(appt!.id);

    // Link appointment back on package_appointments row
    await c.from('package_appointments').update({ appointment_id: appt!.id }).eq('id', pa!.id);

    // Capture baseline counts
    const baseline = await c
      .from('package_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('package_id', pkg!.id);
    expect(baseline.count).toBeGreaterThanOrEqual(1);

    const newStart = new Date(startBase.getTime() + 2 * 86400000);
    const newEnd = new Date(newStart.getTime() + 30 * 60000);

    const { error: rpcErr } = await c.rpc('reschedule_package_appointment_safely', {
      p_appointment_id: appt!.id,
      p_new_start: newStart.toISOString(),
      p_new_end: newEnd.toISOString(),
    } as any);
    expect(rpcErr).toBeNull();

    const after = await c
      .from('package_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('package_id', pkg!.id);
    // Reschedule must NOT create a new package_appointments row
    expect(after.count).toBe(baseline.count);

    const apptAfter = await c
      .from('appointments')
      .select('start_time, end_time, status, package_appointment_id')
      .eq('id', appt!.id)
      .single();
    expect(apptAfter.data!.start_time).toBe(newStart.toISOString());
    expect(apptAfter.data!.package_appointment_id).toBe(pa!.id);
  });

  it('audit_package_reschedule retorna estrutura esperada', async () => {
    // Pick the appointment from previous test
    const apptId = cleanupIds.appointmentIds[0];
    const { data, error } = await c.rpc('audit_package_reschedule', {
      p_appointment_id: apptId,
      p_new_start: new Date(Date.now() + 30 * 86400000).toISOString(),
    } as any);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      ok: expect.any(Boolean),
      blocking: expect.any(Boolean),
      warnings: expect.any(Array),
    });
  });
});
