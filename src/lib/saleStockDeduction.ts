/**
 * Sale Stock Deduction
 *
 * Ferramenta de dedução automática e em tempo real do estoque ao registrar
 * uma venda no caixa. Cobre três cenários:
 *  - Venda de produto: deduz a quantidade vendida do estoque do produto.
 *  - Venda de serviço: deduz os produtos vinculados via `service_products`
 *    (campo `quantity_per_use`) imediatamente, sem esperar o atendimento.
 *  - Venda de pacote: deduz, para cada sessão do pacote, os produtos vinculados
 *    aos serviços que compõem o pacote (via `package_template_steps` ou
 *    `service_packages.service_id`).
 *
 * O registro de cada baixa também é gravado em `product_daily_consumption`
 * para auditoria diária e para alimentar relatórios de consumo.
 *
 * IMPORTANTE: Esta função é idempotente por venda — usa `notes` contendo
 * `sale:<id>` para evitar dupla baixa caso seja chamada novamente.
 */

import { supabase } from '@/integrations/supabase/client';

interface DeductOptions {
  saleId: string;
  itemType: 'service' | 'package' | 'product';
  serviceId?: string | null;
  packageId?: string | null;
  productId?: string | null;
  quantity?: number;
  professionalId?: string | null;
  userId?: string | null;
}

async function alreadyDeducted(saleId: string): Promise<boolean> {
  const { data } = await supabase
    .from('product_daily_consumption')
    .select('id')
    .ilike('notes', `%sale:${saleId}%`)
    .limit(1);
  return !!(data && data.length > 0);
}

async function deductProduct(productId: string, quantity: number) {
  const { data: product } = await supabase
    .from('products')
    .select('current_stock')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return;
  const newStock = Math.max(0, Number(product.current_stock || 0) - quantity);
  await supabase
    .from('products')
    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', productId);
}

async function recordConsumption(opts: {
  saleId: string;
  productId: string;
  quantity: number;
  serviceId?: string | null;
  professionalId?: string | null;
  userId?: string | null;
  unit?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('product_daily_consumption').insert({
    product_id: opts.productId,
    consumption_date: today,
    quantity_used: opts.quantity,
    unit: opts.unit || 'un',
    professional_id: opts.professionalId || null,
    service_id: opts.serviceId || null,
    appointment_id: null,
    notes: `Baixa automática por venda no caixa (sale:${opts.saleId})`,
    created_by: opts.userId || null,
  });
}

async function deductServiceProducts(opts: {
  saleId: string;
  serviceId: string;
  multiplier: number;
  professionalId?: string | null;
  userId?: string | null;
}) {
  const { data: links } = await supabase
    .from('service_products')
    .select('product_id, quantity_per_use, products(unit, current_stock)')
    .eq('service_id', opts.serviceId);

  if (!links || links.length === 0) return;

  for (const link of links as any[]) {
    if (!link.product_id) continue;
    const qty = Number(link.quantity_per_use || 0) * opts.multiplier;
    if (qty <= 0) continue;

    await deductProduct(link.product_id, qty);
    await recordConsumption({
      saleId: opts.saleId,
      productId: link.product_id,
      quantity: qty,
      serviceId: opts.serviceId,
      professionalId: opts.professionalId,
      userId: opts.userId,
      unit: link.products?.unit || 'un',
    });
  }
}

export async function deductStockForSale(opts: DeductOptions): Promise<void> {
  try {
    if (await alreadyDeducted(opts.saleId)) return;

    if (opts.itemType === 'product' && opts.productId) {
      const qty = opts.quantity || 1;
      await deductProduct(opts.productId, qty);
      await recordConsumption({
        saleId: opts.saleId,
        productId: opts.productId,
        quantity: qty,
        professionalId: opts.professionalId,
        userId: opts.userId,
      });
      return;
    }

    if (opts.itemType === 'service' && opts.serviceId) {
      await deductServiceProducts({
        saleId: opts.saleId,
        serviceId: opts.serviceId,
        multiplier: opts.quantity || 1,
        professionalId: opts.professionalId,
        userId: opts.userId,
      });
      return;
    }

    if (opts.itemType === 'package' && opts.packageId) {
      // Get package template/info
      const { data: pkg } = await supabase
        .from('service_packages')
        .select('id, service_id, total_sessions, template_id')
        .eq('id', opts.packageId)
        .maybeSingle();
      if (!pkg) return;

      // Try to get steps (sequential package)
      const { data: steps } = await supabase
        .from('package_template_steps')
        .select('service_id')
        .eq('template_id', pkg.template_id || pkg.id);

      if (steps && steps.length > 0) {
        for (const step of steps) {
          if (!step.service_id) continue;
          await deductServiceProducts({
            saleId: opts.saleId,
            serviceId: step.service_id,
            multiplier: 1,
            professionalId: opts.professionalId,
            userId: opts.userId,
          });
        }
      } else if (pkg.service_id) {
        // Standard package: same service N times
        await deductServiceProducts({
          saleId: opts.saleId,
          serviceId: pkg.service_id,
          multiplier: Number(pkg.total_sessions || 1),
          professionalId: opts.professionalId,
          userId: opts.userId,
        });
      }
    }
  } catch (err) {
    console.error('[deductStockForSale] Falha ao baixar estoque:', err);
  }
}
