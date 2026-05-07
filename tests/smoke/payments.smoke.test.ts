import { afterAll, beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds } from './setup';
import { bootstrap, SmokeContext } from './fixtures';

describeIfCreds('Smoke: pagamento gera entrada de caixa e financeira', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;
  let ctx: SmokeContext;
  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    c = await authedClient();
    ctx = await bootstrap(c);
  });

  afterAll(async () => {
    if (createdSaleIds.length) {
      await c.from('cash_register_entries').delete().in('single_sale_id', createdSaleIds);
      await c.from('payments_audit').delete().in('single_sale_id', createdSaleIds);
      await c.from('single_sales').delete().in('id', createdSaleIds);
    }
    await ctx?.cleanup();
  });

  it('cria venda avulsa e marca como paga (PIX afeta caixa)', async () => {
    const { data: pm } = await c
      .from('payment_methods')
      .select('id, name')
      .ilike('name', '%pix%')
      .limit(1)
      .maybeSingle();
    if (!pm) {
      console.warn('Sem payment_method PIX configurado — pulando');
      return;
    }

    const { data: sale, error } = await c
      .from('single_sales')
      .insert({
        client_id: ctx.clientId,
        professional_id: ctx.professionalId,
        service_id: ctx.serviceId,
        original_amount: 100,
        final_amount: 100,
        payment_method_id: pm.id,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdSaleIds.push(sale!.id);

    const { error: payErr } = await c
      .from('single_sales')
      .update({ paid_at: new Date().toISOString(), paid_by: ctx.userId })
      .eq('id', sale!.id);
    expect(payErr).toBeNull();

    // Trigger reconcile_sale_payment_trigger_fn deve criar registro em cash_register_entries
    await new Promise((r) => setTimeout(r, 800));
    const { data: entries } = await c
      .from('cash_register_entries')
      .select('id, affects_cash, amount')
      .eq('single_sale_id', sale!.id);
    expect(entries?.length).toBeGreaterThan(0);
  });
});
