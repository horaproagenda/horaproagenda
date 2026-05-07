import { SupabaseClient } from '@supabase/supabase-js';
import { tag } from './setup';

export interface SmokeContext {
  userId: string;
  professionalId: string;
  clientId: string;
  serviceId: string;
  productId: string;
  cleanup: () => Promise<void>;
}

export async function bootstrap(c: SupabaseClient): Promise<SmokeContext> {
  const { data: userData } = await c.auth.getUser();
  const userId = userData.user!.id;

  // Use existing professional for this user
  const { data: prof, error: profErr } = await c
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (profErr || !prof) throw new Error('No professional linked to test user');
  const professionalId = prof.id;

  const { data: client, error: clientErr } = await c
    .from('clients')
    .insert({ name: tag('Cliente Smoke'), assigned_professional_id: professionalId })
    .select('id')
    .single();
  if (clientErr) throw clientErr;

  const { data: service, error: serviceErr } = await c
    .from('services')
    .insert({
      name: tag('Serviço Smoke'),
      duration_minutes: 30,
      price: 100,
      professional_id: professionalId,
    })
    .select('id')
    .single();
  if (serviceErr) throw serviceErr;

  const { data: product, error: productErr } = await c
    .from('products')
    .insert({
      name: tag('Produto Smoke'),
      current_stock: 100,
      unit: 'un',
      professional_id: professionalId,
    })
    .select('id')
    .single();
  if (productErr) throw productErr;

  await c
    .from('service_products')
    .insert({ service_id: service.id, product_id: product.id, quantity_per_use: 2 });

  const cleanup = async () => {
    await c.from('service_products').delete().eq('service_id', service.id);
    await c.from('appointments').delete().eq('client_id', client.id);
    await c.from('service_packages').delete().eq('client_id', client.id);
    await c.from('products').delete().eq('id', product.id);
    await c.from('services').delete().eq('id', service.id);
    await c.from('clients').delete().eq('id', client.id);
  };

  return {
    userId,
    professionalId,
    clientId: client.id,
    serviceId: service.id,
    productId: product.id,
    cleanup,
  };
}
