import { createClient } from '@supabase/supabase-js';

const URL = 'https://nsgcllrbswodjoadybsj.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE';
const TAG = `TESTE LOVABLE 🧪 ${Date.now()}`;

const c = createClient(URL, ANON);
const { error: loginErr } = await c.auth.signInWithPassword({
  email: 'mariaterezacastro2@gmail.com',
  password: 'Inciclominas@1',
});
if (loginErr) { console.error('LOGIN', loginErr); process.exit(1); }

const { data: { user } } = await c.auth.getUser();
console.log('Logged in as', user!.email);

const { data: prof } = await c.from('professionals').select('id').eq('user_id', user!.id).maybeSingle();
const PROF = prof!.id;

const results: any[] = [];
function ok(name: string, data: any) { console.log('✅', name); results.push({ name, ok: true, data }); }
function fail(name: string, err: any) { console.log('❌', name, err?.message || err); results.push({ name, ok: false, err: err?.message || String(err) }); }

// ───── D3: SERVIÇO ─────
let serviceId: string | undefined;
{
  const { data, error } = await c.from('services').insert({
    name: `${TAG} Serviço`,
    category: 'Estética',
    duration: 30,
    price: 99.9,
    is_active: true,
    professional_id: PROF,
  }).select('id').single();
  if (error) fail('D3.create service', error); else { serviceId = data.id; ok('D3.create service', data); }
}
if (serviceId) {
  const { error } = await c.from('services').update({ price: 149.9, name: `${TAG} Serviço EDIT` }).eq('id', serviceId);
  error ? fail('D3.edit service', error) : ok('D3.edit service', { serviceId });
}

// ───── D3b: PACOTE ─────
let packageId: string | undefined;
if (serviceId) {
  const { data, error } = await c.from('service_packages').insert({
    name: `${TAG} Pacote`,
    client_id: null,
    service_id: serviceId,
    professional_id: PROF,
    total_sessions: 4,
    sessions_scheduled: 0,
    total_price: 360,
    duration: 30,
    category: 'Estética',
    package_type: 'standard',
    is_active: true,
  }).select('id').single();
  if (error) fail('D3.create package', error); else { packageId = data.id; ok('D3.create package', data); }
}

// ───── D4: PRODUTO ─────
let productId: string | undefined;
{
  const { data, error } = await c.from('products').insert({
    name: `${TAG} Produto`,
    product_type: 'liquid',
    unit: 'ml',
    quantity_purchased: 100,
    unit_price: 1,
    total_price: 100,
    current_stock: 100,
    is_active: true,
    is_for_sale: false,
  }).select('id').single();
  if (error) fail('D4.create product', error); else { productId = data.id; ok('D4.create product', data); }
}
if (productId) {
  const { error } = await c.from('products').update({ min_stock_alert: 10, brand: 'Marca TESTE' }).eq('id', productId);
  error ? fail('D4.edit product', error) : ok('D4.edit product', { productId });
  // Add stock via purchase
  const { error: pe } = await c.from('product_purchases').insert({
    product_id: productId, quantity: 50, unit_price: 1.2, total_price: 60,
    purchase_date: new Date().toISOString().slice(0,10), supplier: 'Fornecedor TESTE',
  });
  pe ? fail('D4.add purchase', pe) : ok('D4.add purchase', {});
}

// ───── D5: AGENDAMENTO ─────
// pick existing client
const { data: anyClient } = await c.from('clients').select('id,name').limit(1).maybeSingle();
let appointmentId: string | undefined;
if (serviceId && anyClient) {
  const start = new Date(Date.now() + 3*86400000); start.setHours(10,0,0,0);
  const end = new Date(start.getTime() + 30*60000);
  const { data, error } = await c.from('appointments').insert({
    client_id: anyClient.id,
    service_id: serviceId,
    professional_id: PROF,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: 'scheduled',
    payment_status: 'pending',
    notes: TAG,
  }).select('id').single();
  if (error) fail('D5.create appointment', error); else { appointmentId = data.id; ok('D5.create appointment', data); }
}
if (appointmentId) {
  // Reschedule
  const start = new Date(Date.now() + 4*86400000); start.setHours(14,0,0,0);
  const end = new Date(start.getTime() + 30*60000);
  const { error: ue } = await c.from('appointments').update({ start_time: start.toISOString(), end_time: end.toISOString() }).eq('id', appointmentId);
  ue ? fail('D5.reschedule', ue) : ok('D5.reschedule', {});
  // Cancel
  const { error: ce } = await c.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId);
  ce ? fail('D5.cancel', ce) : ok('D5.cancel', {});
}

// ───── CLEANUP ─────
if (appointmentId) await c.from('appointments').delete().eq('id', appointmentId);
if (packageId) await c.from('service_packages').delete().eq('id', packageId);
if (productId) {
  await c.from('product_purchases').delete().eq('product_id', productId);
  await c.from('products').delete().eq('id', productId);
}
if (serviceId) await c.from('services').delete().eq('id', serviceId);

console.log('\n────── RESUMO ──────');
console.table(results.map(r => ({ teste: r.name, ok: r.ok, erro: r.err || '' })));
const failed = results.filter(r => !r.ok);
process.exit(failed.length ? 2 : 0);
