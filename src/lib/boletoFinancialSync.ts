import { supabase } from '@/integrations/supabase/client';

/**
 * Espelha cada parcela de boleto em um lançamento financeiro, para que
 * Extrato, Relatório consolidado e Relatórios sempre mostrem o valor correto
 * assim que a baixa é dada.
 *
 * Regra protegida: a parcela paga TEM que existir no extrato/relatório com
 * status pago e a data da baixa. Sem baixa, o lançamento fica pendente.
 */

const tagFor = (installmentId: string) => `[boleto:${installmentId}]`;

type InstallmentRow = {
  id: string;
  sale_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
  status: string | null;
  sale?: {
    id: string;
    description: string | null;
    client_id: string | null;
    payment_method_id?: string | null;
    client?: { name: string | null } | null;
  } | null;
};

const mapStatus = (status: string | null): 'pending' | 'paid' | 'overdue' | 'cancelled' => {
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
};

/**
 * Garante que exista (e esteja atualizado) o lançamento financeiro de cada
 * parcela informada. Falhas aqui nunca devem quebrar a baixa do boleto.
 */
export async function syncBoletoInstallmentsToFinancial(installmentIds: string[]): Promise<void> {
  const ids = Array.from(new Set(installmentIds.filter(Boolean)));
  if (ids.length === 0) return;

  try {
    const { data: rows, error } = await supabase
      .from('boleto_installments')
      .select(`
        id, sale_id, installment_number, total_installments, amount, due_date, paid_date, status,
        sale:single_sales(id, description, client_id, client:clients(name))
      `)
      .in('id', ids);
    if (error) throw error;

    const installments = (rows || []) as unknown as InstallmentRow[];
    if (installments.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();

    for (const item of installments) {
      const tag = tagFor(item.id);
      const clientName = item.sale?.client?.name || 'Cliente';
      const saleLabel = item.sale?.description || 'Boleto parcelado';
      const number = item.installment_number || 1;
      const total = item.total_installments || 1;
      const status = mapStatus(item.status);
      const description = `Boleto ${number}/${total}: ${saleLabel} - ${clientName}`;
      const amount = Number(item.amount || 0);
      const dueDate = item.due_date || new Date().toISOString().split('T')[0];
      const paidDate = status === 'paid' ? (item.paid_date || new Date().toISOString().split('T')[0]) : null;

      // 1) Lançamento já espelhado por esta parcela.
      const { data: tagged } = await supabase
        .from('financial_entries')
        .select('id')
        .ilike('notes', `%${tag}%`)
        .limit(1);

      if (tagged && tagged.length > 0) {
        await supabase
          .from('financial_entries')
          .update({
            description,
            amount,
            due_date: dueDate,
            paid_date: paidDate,
            status,
            paid_by: status === 'paid' ? (user?.id ?? null) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tagged[0].id);
        continue;
      }

      // 2) Lançamento antigo (criado pela venda) sem etiqueta: adota em vez de duplicar.
      let adoptedId: string | null = null;
      if (item.sale_id) {
        const { data: legacy } = await supabase
          .from('financial_entries')
          .select('id, notes')
          .eq('sale_id', item.sale_id)
          .eq('due_date', dueDate)
          .limit(5);
        const candidate = (legacy || []).find((e: any) => !String(e.notes || '').includes('[boleto:'));
        if (candidate) {
          adoptedId = candidate.id;
          await supabase
            .from('financial_entries')
            .update({
              description,
              amount,
              paid_date: paidDate,
              status,
              paid_by: status === 'paid' ? (user?.id ?? null) : null,
              notes: `${candidate.notes ? `${candidate.notes} ` : ''}${tag}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', adoptedId);
        }
      }
      if (adoptedId) continue;

      // 3) Cria o lançamento espelho.
      await supabase.from('financial_entries').insert({
        type: 'receivable',
        description,
        amount,
        due_date: dueDate,
        paid_date: paidDate,
        status,
        client_id: item.sale?.client_id ?? null,
        sale_id: item.sale_id,
        installments: total,
        notes: `Parcela de boleto ${number}/${total} ${tag}`,
        created_by: user?.id ?? null,
        paid_by: status === 'paid' ? (user?.id ?? null) : null,
      });
    }
  } catch (err) {
    console.error('[boletoFinancialSync] Falha ao espelhar parcelas no financeiro:', err);
  }
}

/** Remove o lançamento espelho quando a parcela é excluída. */
export async function removeBoletoInstallmentFinancialEntry(installmentId: string): Promise<void> {
  try {
    await supabase.from('financial_entries').delete().ilike('notes', `%${tagFor(installmentId)}%`);
  } catch (err) {
    console.error('[boletoFinancialSync] Falha ao remover lançamento espelho:', err);
  }
}
