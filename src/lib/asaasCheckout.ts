// Checkout da assinatura via ASAAS (meio oficial de recebimento).
//
// O valor por usuário é definido por você nos Links de Pagamento do Asaas —
// nunca fixo em código. O acesso é liberado em tempo real pelo webhook e
// reforçado pela conferência sob demanda no retorno da tela de sucesso.
import { supabase } from '@/integrations/supabase/client';
import { goToCheckout } from '@/lib/stripeCheckout';

export interface StartSubscriptionInput {
  seats: number;
  billingMonths: number;
  /** CPF/CNPJ do assinante (obrigatório para emitir a cobrança no Asaas). */
  cpfCnpj?: string;
}

export interface StartSubscriptionResult {
  /** true quando o app já navegou para a fatura do Asaas. */
  redirected: boolean;
  /** true quando falta o CPF/CNPJ para emitir a cobrança. */
  needDocument?: boolean;
  error?: string;
}

interface InvokeErrorBody {
  error?: string;
  need_document?: boolean;
  need_subscription?: boolean;
}

/** Lê o corpo de erro da edge function (Supabase embala em FunctionsHttpError). */
async function readErrorBody(error: unknown): Promise<InvokeErrorBody> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      return (await ctx.json()) as InvokeErrorBody;
    } catch {
      /* corpo não-JSON */
    }
  }
  return {};
}

/** Cria a assinatura no Asaas e leva o usuário à fatura (Pix, cartão ou boleto). */
export async function startAsaasSubscription(
  input: StartSubscriptionInput,
): Promise<StartSubscriptionResult> {
  const { data, error } = await supabase.functions.invoke('asaas-create-subscription', {
    body: {
      seats: input.seats,
      billingMonths: input.billingMonths,
      cpfCnpj: input.cpfCnpj,
    },
  });

  if (error) {
    const body = await readErrorBody(error);
    if (body.need_document) return { redirected: false, needDocument: true, error: body.error };
    return { redirected: false, error: body.error || error.message };
  }
  if (!data?.url) {
    return { redirected: false, error: 'Não foi possível gerar o link de pagamento.' };
  }
  goToCheckout(data.url as string);
  return { redirected: true };
}

/** Abre a fatura em aberto (usado em "Atualizar pagamento" / "Pagar agora"). */
export async function openAsaasInvoice(): Promise<StartSubscriptionResult> {
  const { data, error } = await supabase.functions.invoke('asaas-invoice-url');
  if (error) {
    const body = await readErrorBody(error);
    return { redirected: false, error: body.error || error.message };
  }
  if (!data?.url) {
    return { redirected: false, error: 'Nenhuma fatura em aberto no momento.' };
  }
  goToCheckout(data.url as string);
  return { redirected: true };
}

/** Confere no Asaas se a assinatura está paga e atualiza a conta. */
export async function syncSubscriptionWithAsaas(): Promise<void> {
  try {
    await supabase.functions.invoke('asaas-check-subscription');
  } catch (e) {
    console.warn('[asaasCheckout] asaas-check-subscription falhou:', e);
  }
}
