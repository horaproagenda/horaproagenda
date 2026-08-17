/**
 * Tratamento de cobrança recusada (incluindo a cobrança automática do fim do
 * teste gratuito): calcula a carência, marca a assinatura e notifica por e-mail
 * o administrador (com instrução para atualizar a forma de pagamento) e a
 * equipe da conta (aviso de pendência).
 *
 * Mantém a mesma regra do front (`src/lib/subscriptionAccess.ts`):
 * carência = data da falha + PAYMENT_GRACE_DAYS dias.
 */

// deno-lint-ignore-file no-explicit-any

export const PAYMENT_GRACE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatBrDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatBrl(amountCents?: number | null, currency = 'brl'): string | undefined {
  if (!amountCents || amountCents <= 0) return undefined;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: (currency || 'brl').toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `R$ ${(amountCents / 100).toFixed(2).replace('.', ',')}`;
  }
}

export interface FailureContext {
  /** true quando a cobrança recusada é a do encerramento do teste gratuito */
  isTrialCharge: boolean;
  /** valor já formatado, ex.: "R$ 149,00" */
  amount?: string;
  /** chave de idempotência base (id da invoice/evento) */
  idempotencyBase: string;
  /** observação adicional exibida no e-mail */
  reason?: string;
}

type SendEmail = (
  recipientEmail: string,
  name: string | undefined,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
) => Promise<void>;

/**
 * Registra a falha (status past_due + carência) e dispara os e-mails.
 * `supabase` deve ser um client com service role.
 */
export async function handlePaymentFailure(
  supabase: any,
  ownerUserId: string,
  ctx: FailureContext,
  sendEmail: SendEmail,
  log: (step: string, details?: unknown) => void = () => {},
): Promise<void> {
  const now = Date.now();

  const { data: sub } = await supabase
    .from('account_subscriptions')
    .select('current_period_end, trial_ends_at, status')
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();

  const refRaw = ctx.isTrialCharge
    ? (sub?.trial_ends_at ?? sub?.current_period_end)
    : (sub?.current_period_end ?? sub?.trial_ends_at);
  const refMs = refRaw ? new Date(refRaw).getTime() : NaN;
  const failedAt = Number.isFinite(refMs) ? Math.min(refMs, now) : now;
  const graceEnds = failedAt + PAYMENT_GRACE_DAYS * DAY_MS;
  const graceDays = graceEnds > now ? Math.max(1, Math.ceil((graceEnds - now) / DAY_MS)) : 0;
  const graceDeadline = formatBrDate(new Date(graceEnds));

  await supabase
    .from('account_subscriptions')
    .update({ status: 'past_due' })
    .eq('owner_user_id', ownerUserId);

  // ── Administrador (dono da conta) ────────────────────────────────
  const { data: ownerAuth } = await (supabase.auth as any).admin.getUserById(ownerUserId);
  const ownerEmail = ownerAuth?.user?.email as string | undefined;
  const ownerName = (ownerAuth?.user?.user_metadata?.full_name as string | undefined)
    ?? ownerEmail?.split('@')[0];

  if (ownerEmail) {
    await sendEmail(
      ownerEmail,
      ownerName,
      {
        kind: ctx.isTrialCharge ? 'trial_charge_failed' : 'payment_failed',
        isAdmin: true,
        amount: ctx.amount,
        graceDays,
        graceDeadline,
        reason: ctx.reason,
      },
      `pay-fail-admin-${ctx.idempotencyBase}`,
    );
  } else {
    log('Owner sem e-mail, notificação do admin ignorada', { ownerUserId });
  }

  // ── Demais usuários da conta ─────────────────────────────────────
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('account_owner_id', ownerUserId);

  for (const p of (staff ?? [])) {
    if (!p?.email || p.id === ownerUserId) continue;
    if (ownerEmail && p.email.toLowerCase() === ownerEmail.toLowerCase()) continue;
    await sendEmail(
      p.email,
      p.full_name ?? undefined,
      {
        kind: 'payment_grace_staff',
        graceDays,
        graceDeadline,
        adminEmail: ownerEmail,
      },
      `pay-fail-staff-${ctx.idempotencyBase}-${p.id}`,
    );
  }

  log('Falha de pagamento tratada', {
    ownerUserId,
    isTrialCharge: ctx.isTrialCharge,
    graceDeadline,
    graceDays,
    staff: staff?.length ?? 0,
  });
}

/** Notifica suspensão definitiva (carência encerrada / assinatura perdida). */
export async function notifyAccessSuspended(
  supabase: any,
  ownerUserId: string,
  idempotencyBase: string,
  sendEmail: SendEmail,
  reason?: string,
): Promise<void> {
  const { data: ownerAuth } = await (supabase.auth as any).admin.getUserById(ownerUserId);
  const ownerEmail = ownerAuth?.user?.email as string | undefined;
  if (!ownerEmail) return;
  const ownerName = (ownerAuth?.user?.user_metadata?.full_name as string | undefined)
    ?? ownerEmail.split('@')[0];
  await sendEmail(
    ownerEmail,
    ownerName,
    { kind: 'access_suspended', isAdmin: true, reason },
    `access-suspended-${idempotencyBase}`,
  );
}
