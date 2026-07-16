import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds, tag } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

/**
 * Smoke E2E do gatilho `decrease_product_stock_on_appointment_complete`:
 * cobre vínculos por serviço direto, por template de pacote e pela etapa
 * do pacote, além do modo estimado (com conversão de unidade).
 *
 * Requer SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD.
 */
describeIfCreds('Smoke: estoque baixa por serviço + template + etapa de pacote', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;

  // Recursos criados dentro deste arquivo (limpos no afterAll)
  const extraIds = {
    productExactId: '' as string,
    productEstimatedId: '' as string,
    templateId: '' as string,
    stepServiceId: '' as string,
    servicePackageId: '' as string,
    appointmentId: '' as string,
    packageApptId: '' as string,
  };

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);

    // Produto modo exato (ml)
    const { data: pExact, error: e1 } = await c
      .from('products')
      .insert({
        name: tag('Prod Exato'),
        product_type: 'liquid',
        unit: 'ml',
        quantity_purchased: 500,
        unit_price: 1,
        total_price: 500,
        current_stock: 500,
        is_active: true,
        is_for_sale: false,
      })
      .select('id')
      .single();
    if (e1) throw e1;
    extraIds.productExactId = pExact.id;

    // Produto modo estimado (kg) — recipiente em ml, cross-family densidade 1
    const { data: pEst, error: e2 } = await c
      .from('products')
      .insert({
        name: tag('Prod Estimado'),
        product_type: 'solid',
        unit: 'kg',
        quantity_purchased: 25,
        unit_price: 40,
        total_price: 1000,
        current_stock: 25,
        is_active: true,
        is_for_sale: false,
      })
      .select('id')
      .single();
    if (e2) throw e2;
    extraIds.productEstimatedId = pEst.id;

    // Serviço para virar a "etapa" do pacote
    const { data: stepSvc, error: e3 } = await c
      .from('services')
      .insert({
        name: tag('Etapa Smoke'),
        category: 'Smoke',
        duration: 30,
        price: 50,
        is_active: true,
        professional_id: ctx.professionalId,
      })
      .select('id')
      .single();
    if (e3) throw e3;
    extraIds.stepServiceId = stepSvc.id;

    // service_products para a etapa: 20 ml do produto exato
    const { error: e4 } = await c.from('service_products').insert({
      service_id: stepSvc.id,
      product_id: pExact.id,
      quantity_per_use: 20,
      tracking_method: 'exact',
    });
    if (e4) throw e4;

    // Template de pacote com um vínculo ESTIMADO ao produto em kg
    const { data: tpl, error: e5 } = await c
      .from('package_templates')
      .insert({
        name: tag('Template Smoke'),
        total_sessions: 1,
        total_price: 100,
      })
      .select('id')
      .single();
    if (e5) throw e5;
    extraIds.templateId = tpl.id;

    const { error: e6 } = await c.from('package_template_products').insert({
      template_id: tpl.id,
      product_id: pEst.id,
      quantity_per_use: 0,
      tracking_method: 'estimated',
      container_amount: 100, // 100 ml
      container_unit: 'ml',
      estimated_appointments: 10, // → 10 ml/uso → 0.01 kg
    });
    if (e6) throw e6;

    // service_package + package_appointment ligado a um appointment
    const start = new Date(Date.now() + 4 * 86400_000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    const { data: appt, error: e7 } = await c
      .from('appointments')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: stepSvc.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'scheduled',
        payment_status: 'pending',
      })
      .select('id')
      .single();
    if (e7) throw e7;
    extraIds.appointmentId = appt.id;

    const { data: pkg, error: e8 } = await c
      .from('service_packages')
      .insert({
        client_id: ctx.clientId,
        template_id: tpl.id,
        service_id: stepSvc.id,
        professional_id: ctx.professionalId,
        total_sessions: 1,
        sessions_scheduled: 1,
        payment_method: 'dinheiro',
      })
      .select('id')
      .single();
    if (e8) throw e8;
    extraIds.servicePackageId = pkg.id;

    const { data: pa, error: e9 } = await c
      .from('package_appointments')
      .insert({
        package_id: pkg.id,
        appointment_id: appt.id,
        service_id: stepSvc.id,
        session_number: 1,
        sequence_order: 1,
        scheduled_date: start.toISOString(),
        status: 'scheduled',
      })
      .select('id')
      .single();
    if (e9) throw e9;
    extraIds.packageApptId = pa.id;
  });

  afterAll(async () => {
    if (extraIds.appointmentId) {
      await c.from('appointment_product_consumption').delete().eq('appointment_id', extraIds.appointmentId);
      await c.from('product_daily_consumption').delete().eq('appointment_id', extraIds.appointmentId);
      await c.from('package_appointments').delete().eq('id', extraIds.packageApptId);
      await c.from('appointments').delete().eq('id', extraIds.appointmentId);
    }
    if (extraIds.servicePackageId) {
      await c.from('service_packages').delete().eq('id', extraIds.servicePackageId);
    }
    if (extraIds.templateId) {
      await c.from('package_template_products').delete().eq('template_id', extraIds.templateId);
      await c.from('package_templates').delete().eq('id', extraIds.templateId);
    }
    if (extraIds.stepServiceId) {
      await c.from('service_products').delete().eq('service_id', extraIds.stepServiceId);
      await c.from('services').delete().eq('id', extraIds.stepServiceId);
    }
    if (extraIds.productExactId) {
      await c.from('products').delete().eq('id', extraIds.productExactId);
    }
    if (extraIds.productEstimatedId) {
      await c.from('products').delete().eq('id', extraIds.productEstimatedId);
    }
    await ctx?.cleanup();
  });

  it('ao concluir o atendimento, deduz estoque e registra consumo (serviço + template)', async () => {
    const { data: before } = await c
      .from('products')
      .select('id, current_stock')
      .in('id', [extraIds.productExactId, extraIds.productEstimatedId]);
    const beforeMap = Object.fromEntries((before ?? []).map((p) => [p.id, Number(p.current_stock)]));

    // Dispara o trigger
    const { error: uErr } = await c
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', extraIds.appointmentId);
    expect(uErr).toBeNull();

    // Aguarda propagação
    await new Promise((r) => setTimeout(r, 800));

    // Confere consumo por atendimento
    const { data: cons } = await c
      .from('appointment_product_consumption')
      .select('product_id, quantity_used, source_type')
      .eq('appointment_id', extraIds.appointmentId);

    const byProd = Object.fromEntries((cons ?? []).map((r) => [r.product_id, Number(r.quantity_used)]));
    // Serviço: 20 ml
    expect(byProd[extraIds.productExactId]).toBe(20);
    // Template estimado: 100 ml / 10 → 10 ml → 0.01 kg
    expect(byProd[extraIds.productEstimatedId]).toBeCloseTo(0.01, 6);

    // Confere baixa de estoque
    const { data: after } = await c
      .from('products')
      .select('id, current_stock')
      .in('id', [extraIds.productExactId, extraIds.productEstimatedId]);
    const afterMap = Object.fromEntries((after ?? []).map((p) => [p.id, Number(p.current_stock)]));

    expect(afterMap[extraIds.productExactId]).toBe(beforeMap[extraIds.productExactId] - 20);
    expect(afterMap[extraIds.productEstimatedId]).toBeCloseTo(beforeMap[extraIds.productEstimatedId] - 0.01, 6);

    // Confere consumo diário registrado
    const { data: daily } = await c
      .from('product_daily_consumption')
      .select('product_id, quantity_used')
      .eq('appointment_id', extraIds.appointmentId);
    expect((daily ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('ao reabrir o atendimento, devolve estoque e limpa consumo', async () => {
    const { data: before } = await c
      .from('products')
      .select('id, current_stock')
      .in('id', [extraIds.productExactId, extraIds.productEstimatedId]);
    const beforeMap = Object.fromEntries((before ?? []).map((p) => [p.id, Number(p.current_stock)]));

    const { error } = await c
      .from('appointments')
      .update({ status: 'scheduled' })
      .eq('id', extraIds.appointmentId);
    expect(error).toBeNull();

    await new Promise((r) => setTimeout(r, 800));

    const { data: cons } = await c
      .from('appointment_product_consumption')
      .select('id')
      .eq('appointment_id', extraIds.appointmentId);
    expect((cons ?? []).length).toBe(0);

    const { data: after } = await c
      .from('products')
      .select('id, current_stock')
      .in('id', [extraIds.productExactId, extraIds.productEstimatedId]);
    const afterMap = Object.fromEntries((after ?? []).map((p) => [p.id, Number(p.current_stock)]));

    expect(afterMap[extraIds.productExactId]).toBe(beforeMap[extraIds.productExactId] + 20);
    expect(afterMap[extraIds.productEstimatedId]).toBeCloseTo(beforeMap[extraIds.productEstimatedId] + 0.01, 6);
  });
});
