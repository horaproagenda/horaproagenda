import { supabase } from '@/integrations/supabase/client';
import { resolveFinancialDestination, resolveFinancialDestinationForPackage } from '@/lib/financialDestination';

/**
 * ÚNICO jeito de gravar movimentações de dinheiro avulsas (devoluções,
 * suprimento, sangria, despesa). Toda tela deve usar estas funções para que
 * o caixa escolhido, os campos e o tratamento de erro sejam sempre iguais.
 * Erros do banco são lançados (antes eram ignorados silenciosamente).
 */
export interface CashMovementInput {
  cashRegisterId: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
}

export interface FinancialMovementInput {
  type: 'income' | 'expense';
  description: string;
  amount: number;
  date: string; // yyyy-MM-dd
  clientId?: string | null;
  notes?: string | null;
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function recordCashMovement(input: CashMovementInput) {
  if (!(input.amount > 0)) return;
  const { error } = await supabase.from('cash_transactions').insert({
    cash_register_id: input.cashRegisterId,
    type: input.type,
    category: input.category,
    description: input.description,
    amount: input.amount,
    payment_method: input.paymentMethod ?? null,
    reference_id: input.referenceId ?? null,
    reference_type: input.referenceType ?? null,
    created_by: await currentUserId(),
  } as any);
  if (error) throw error;
}

export async function recordPaidFinancialEntry(input: FinancialMovementInput) {
  if (!(input.amount > 0)) return;
  const { error } = await supabase.from('financial_entries').insert({
    type: input.type,
    description: input.description,
    amount: input.amount,
    due_date: input.date,
    paid_date: input.date,
    status: 'paid',
    client_id: input.clientId ?? null,
    notes: input.notes ?? null,
    created_by: await currentUserId(),
  } as any);
  if (error) throw error;
}

/**
 * Caixa correto para uma devolução: o do profissional dono da venda/pacote
 * (independente) ou o da clínica — mesma regra usada nas vendas.
 */
export async function resolveRefundCashRegister(opts: { packageId?: string | null; professionalId?: string | null }) {
  const dest = opts.packageId
    ? await resolveFinancialDestinationForPackage(opts.packageId)
    : await resolveFinancialDestination(opts.professionalId ?? null);
  return dest.cashRegisterId;
}
