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

// Unique phone suffix per run to avoid clients_phone_key collisions across retries
function uniquePhone() {
  const n = Math.floor(Math.random() * 1e9).toString().padStart(9, '0');
  return `11${n}`.slice(0, 11);
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
    .insert({
      name: tag('Cliente Smoke'),
      phone: uniquePhone(),
      assigned_professional_id: professionalId,
    })
    .select('id')
    .single();
  if (clientErr) throw clientErr;

  const { data: service, error: serviceErr } = await c
    .from('services')
    .insert({
      name: tag('Serviço Smoke'),
      category: 'Smoke',
      duration: 30,
      price: 100,
      is_active: true,
      professional_id: professionalId,
    })
    .select('id')
    .single();
  if (serviceErr) throw serviceErr;

  const { data: product, error: productErr } = await c
    .from('products')
    .insert({
      name: tag('Produto Smoke'),
      product_type: 'liquid',
      unit: 'ml',
      quantity_purchased: 100,
      unit_price: 1,
      total_price: 100,
      current_stock: 100,
      is_active: true,
      is_for_sale: false,
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
