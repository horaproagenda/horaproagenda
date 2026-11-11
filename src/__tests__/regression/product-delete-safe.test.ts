import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
const dir = 'supabase/migrations';
const sql = readdirSync(dir).sort().map(f => readFileSync(`${dir}/${f}`, 'utf8')).filter(s => s.includes('FUNCTION public.delete_product_safe')).pop() ?? '';
describe('product deletion', () => {
  it('uses the safe delete RPC', () => {
    expect(readFileSync('src/hooks/useProducts.ts', 'utf8')).toContain("rpc('delete_product_safe'");
  });
  it('archives products with history instead of failing', () => {
    expect(sql).toContain("jsonb_build_object('result','archived')");
    expect(sql).toContain('app.deleting_product_id');
  });
});
