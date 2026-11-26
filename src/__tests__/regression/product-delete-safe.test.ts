import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
const dir = 'supabase/migrations';
const sql = readdirSync(dir).sort().map(f => readFileSync(`${dir}/${f}`, 'utf8')).filter(s => s.includes('FUNCTION public.delete_product_safe')).pop() ?? '';
describe('product deletion', () => {
  it('uses the safe delete RPC', () => {
    expect(readFileSync('src/hooks/useProducts.ts', 'utf8')).toContain("rpc('delete_product_safe'");
  });
  it('apaga o produto de vez, nunca apenas desativa', () => {
    expect(sql).not.toContain("'archived'");
    expect(sql).toContain('DELETE FROM public.products WHERE id = p_id');
  });
  it('apaga o histórico do produto', () => {
    for (const t of ['product_usage_records', 'product_daily_consumption', 'product_purchases', 'product_usage_events', 'service_products', 'package_template_products'])
      expect(sql).toContain(`DELETE FROM public.${t}`);
  });
  it('preserva atendimentos e fichas, só removendo o vínculo', () => {
    expect(sql).toContain('UPDATE public.appointment_additional_items');
    expect(sql).toContain('UPDATE public.application_items SET product_id = NULL');
  });
  it('confere permissão antes de apagar', () => {
    expect(sql).toContain("has_role(v_uid,'admin')");
    expect(sql).toContain('current_account_owner_id()');
  });
  it('item extra vendido não bloqueia a exclusão e guarda o nome', () => {
    expect(sql).toContain('product_name_snapshot = COALESCE(product_name_snapshot, v_name)');
    const all = readdirSync(dir).sort().map(f => readFileSync(`${dir}/${f}`, 'utf8')).filter(s => s.includes('appointment_additional_items_item_ref_check')).pop() ?? '';
    expect(all).toContain('product_id IS NOT NULL OR product_name_snapshot IS NOT NULL');
  });
});
