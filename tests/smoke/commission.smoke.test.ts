import { beforeAll, expect, it } from 'vitest';
import { authedClient, describeIfCreds } from './setup';

describeIfCreds('Smoke: configuração de comissão do profissional', () => {
  let c: Awaited<ReturnType<typeof authedClient>>;

  beforeAll(async () => {
    c = await authedClient();
  });

  it('lê config de comissão do profissional logado', async () => {
    const { data: u } = await c.auth.getUser();
    const { data, error } = await c
      .from('professionals')
      .select('id, is_commission_based, commission_type, commission_percentage, commission_fixed_value, commission_frequency')
      .eq('user_id', u.user!.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});
