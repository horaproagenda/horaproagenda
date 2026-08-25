// Checkout da assinatura via ASAAS (meio oficial de recebimento).
//
// A assinatura é criada com CARTÃO de crédito/débito tokenizado pelo Asaas —
// o aplicativo nunca armazena número completo nem código de segurança, apenas
// bandeira e últimos 4 dígitos. No primeiro cadastro do cartão começa o teste
// gratuito de 20 dias; a primeira cobrança acontece automaticamente no fim do
// teste. O acesso é liberado/bloqueado em tempo real pelo webhook.
import { supabase } from '@/integrations/supabase/client';
import { goToCheckout } from '@/lib/stripeCheckout';

export interface CreditCardInput {
  holderName: string;
  number: string;
  expiryMonth: string; // "MM"
  expiryYear: string;  // "AAAA"
  ccv: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone?: string;
}

export interface StartSubscriptionInput {
  seats: number;
  billingMonths: number;
  card: CreditCardInput;
}

export interface StartSubscriptionResult {
  /** true quando o app já navegou para uma página externa (fatura Asaas). */
  redirected: boolean;
  /** true quando a assinatura foi criada com cartão (teste ou cobrança). */
  started?: boolean;
  /** true quando o teste gratuito de 20 dias começou. */
  trialing?: boolean;
  trialEndsAt?: string | null;
  nextBillingAt?: string | null;
  value?: number;
  error?: string;
}

export interface UpdateCardResult {
  ok: boolean;
  retried?: boolean;
  accessRestored?: boolean;
  error?: string;
}

interface InvokeErrorBody {
  error?: string;
  message?: string;
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

function cardBody(card: CreditCardInput) {
  return {
    creditCard: {
      holderName: card.holderName,
      number: card.number.replace(/\D+/g, ''),
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      ccv: card.ccv,
    },
    holderInfo: {
      name: card.holderName,
      cpfCnpj: card.cpfCnpj,
      postalCode: card.postalCode,
      addressNumber: card.addressNumber,
      phone: card.phone,
    },
  };
}

/**
 * Cria a assinatura no Asaas com cartão. No primeiro cadastro, inicia o teste
 * gratuito de 20 dias (sem cobrança antes do fim); depois, cobra na hora.
 */
export async function startAsaasSubscription(
  input: StartSubscriptionInput,
): Promise<StartSubscriptionResult> {
  const { data, error } = await supabase.functions.invoke('asaas-create-subscription', {
    body: {
      seats: input.seats,
      billingMonths: input.billingMonths,
      ...cardBody(input.card),
    },
  });

  if (error) {
    const body = await readErrorBody(error);
    return { redirected: false, error: body.message || body.error || error.message };
  }
  if (!data?.ok) {
    return { redirected: false, error: data?.error || 'Não foi possível criar a assinatura.' };
  }
  return {
    redirected: false,
    started: true,
    trialing: !!data.trialing,
    trialEndsAt: data.trial_ends_at ?? null,
    nextBillingAt: data.next_billing_at ?? null,
    value: typeof data.value === 'number' ? data.value : undefined,
  };
}

/**
 * Troca o cartão da assinatura e tenta novamente a cobrança em aberto.
 * Se o pagamento for aprovado na hora, o acesso é restaurado automaticamente.
 */
export async function updateAsaasCard(card: CreditCardInput): Promise<UpdateCardResult> {
  const { data, error } = await supabase.functions.invoke('asaas-update-card', {
    body: cardBody(card),
  });
  if (error) {
    const body = await readErrorBody(error);
    return { ok: false, error: body.message || body.error || error.message };
  }
  if (!data?.ok) {
    return { ok: false, error: data?.error || 'Não foi possível atualizar o cartão.' };
  }
  return {
    ok: true,
    retried: !!data.retried,
    accessRestored: !!data.access_restored,
  };
}

/** Abre a fatura em aberto no Asaas (Pix/boleto) como alternativa ao cartão. */
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
