import { supabase } from '@/integrations/supabase/client';

export type BoletoPackageReleaseRule = 'boleto_first_paid' | 'boleto_all_paid';

const ACTIVE_STATUSES = new Set(['pending', 'overdue', 'paid']);

const distributeCents = (total: number, count: number) => {
  if (count <= 0) return [];
  const totalCents = Math.max(0, Math.round(total * 100));
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
};

export async function redistributeActiveBoletoInstallments(saleId: string) {
  const { data: sale, error: saleError } = await supabase
    .from('single_sales')
    .select('id, original_amount, final_amount')
    .eq('id', saleId)
    .maybeSingle();

  if (saleError) throw saleError;
  if (!sale) return;

  const { data: installments, error: installmentsError } = await supabase
    .from('boleto_installments')
    .select('id, status, amount, due_date, installment_number, created_at')
    .eq('sale_id', saleId);

  if (installmentsError) throw installmentsError;

  const activeInstallments = (installments || [])
    .filter((item: any) => ACTIVE_STATUSES.has(item.status))
    .sort((a: any, b: any) => {
      const dueDiff = String(a.due_date).localeCompare(String(b.due_date));
      if (dueDiff !== 0) return dueDiff;
      return Number(a.installment_number || 0) - Number(b.installment_number || 0);
    });

  const activeCount = activeInstallments.length;
  const paidInstallments = activeInstallments.filter((item: any) => item.status === 'paid');
  const payableInstallments = activeInstallments.filter((item: any) => item.status !== 'paid');
  const targetTotal = Number(sale.final_amount ?? sale.original_amount ?? 0);
  const alreadyPaid = paidInstallments.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const redistributedAmounts = distributeCents(targetTotal - alreadyPaid, payableInstallments.length);
  const payableAmountById = new Map(payableInstallments.map((item: any, index: number) => [item.id, redistributedAmounts[index]]));

  await Promise.all(activeInstallments.map((item: any, index: number) => {
    const updates: Record<string, any> = {
      installment_number: index + 1,
      total_installments: activeCount,
      updated_at: new Date().toISOString(),
    };
    if (payableAmountById.has(item.id)) {
      updates.amount = payableAmountById.get(item.id);
    }
    return supabase.from('boleto_installments').update(updates).eq('id', item.id);
  }));

  await supabase
    .from('single_sales')
    .update({ installments: activeCount, updated_at: new Date().toISOString() })
    .eq('id', saleId);
}

export async function syncBoletoPackageAvailability(saleId: string) {
  const { data: sale, error: saleError } = await supabase
    .from('single_sales')
    .select('id, item_type, package_id, paid_at, final_amount, original_amount')
    .eq('id', saleId)
    .maybeSingle();

  if (saleError) throw saleError;
  if (!sale) return;

  const { data: installments, error: installmentsError } = await supabase
    .from('boleto_installments')
    .select('status, installment_number, due_date, paid_date')
    .eq('sale_id', saleId);

  if (installmentsError) throw installmentsError;

  const activeInstallments = (installments || [])
    .filter((item: any) => item.status !== 'cancelled')
    .sort((a: any, b: any) => {
      const numberDiff = Number(a.installment_number || 0) - Number(b.installment_number || 0);
      if (numberDiff !== 0) return numberDiff;
      return String(a.due_date || '').localeCompare(String(b.due_date || ''));
    });
  const paidCount = activeInstallments.filter((item: any) => item.status === 'paid').length;
  const allPaid = activeInstallments.length > 0 && paidCount === activeInstallments.length;

  // Marca a venda como paga quando todas as parcelas estiverem pagas — habilita
  // fluxos que dependem de single_sales.paid_at (histórico do cliente, gatilhos).
  if (allPaid && !sale.paid_at) {
    const lastPaidDate = activeInstallments
      .map((item: any) => item.paid_date)
      .filter(Boolean)
      .sort()
      .pop() || new Date().toISOString().split('T')[0];
    await supabase
      .from('single_sales')
      .update({ paid_at: new Date(`${lastPaidDate}T12:00:00`).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', saleId);
  }

  if (!sale.package_id || sale.item_type !== 'package') return;

  const { data: pkg, error: packageError } = await supabase
    .from('service_packages')
    .select('id, is_active, payment_type')
    .eq('id', sale.package_id)
    .maybeSingle();

  if (packageError) throw packageError;
  if (!pkg) return;

  // Regra de liberação: se a config estiver em um dos modos de boleto usa a regra;
  // caso contrário, libera assim que TODAS estiverem pagas (compatibilidade retroativa).
  const shouldActivate = pkg.payment_type === 'boleto_first_paid'
    ? activeInstallments[0]?.status === 'paid'
    : allPaid;

  if (shouldActivate && !pkg.is_active) {
    const { error } = await supabase
      .from('service_packages')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', pkg.id);
    if (error) throw error;
  }
}