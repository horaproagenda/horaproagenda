/**
 * Teste ponta a ponta (simulado) do fluxo de assinatura Asaas.
 *
 * Protege as regras críticas:
 *  1. Cliente cadastra cartão → assinatura criada no gateway → conta em teste
 *     gratuito, com o aplicativo LIBERADO (nunca bloqueado).
 *  2. Webhook de pagamento confirmado → assinatura ativa até o fim do ciclo,
 *     seguindo liberada.
 *  3. Se o app falhar DEPOIS da criação no gateway e o usuário tentar de novo,
 *     a assinatura existente é reaproveitada — sem duplicar cobrança.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  paidPeriodEnd,
  parseSubscriptionReference,
  pickReusableSubscription,
  subscriptionExternalReference,
} from '../../../supabase/functions/_shared/asaasSubscriptionReconcile';
import { grantsAppAccess } from '../subscriptionSync';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TRIAL_DAYS = 20;
const DAY_MS = 86_400_000;

interface RemoteSub {
  id: string;
  status: string;
  externalReference: string;
  deleted?: boolean;
}

interface LocalSub {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  asaas_subscription_id: string | null;
}

/** Gateway Asaas em memória. */
class FakeAsaas {
  subs: RemoteSub[] = [];
  created = 0;
  create(externalReference: string): RemoteSub {
    const sub = { id: `sub_${++this.created}`, status: 'ACTIVE', externalReference };
    this.subs.push(sub);
    return sub;
  }
  listByCustomer(): RemoteSub[] {
    return this.subs;
  }
}

/** Passo "cadastrar cartão": reaproveita ou cria, como na Edge Function. */
function subscribeWithCard(
  gateway: FakeAsaas,
  local: LocalSub,
  opts: { seats: number; months: number; failLocalWrite?: boolean; now: number },
): { subscriptionId: string; local: LocalSub } {
  const ref = subscriptionExternalReference(OWNER, opts.seats, opts.months);
  const subscriptionId =
    local.asaas_subscription_id ?? pickReusableSubscription(gateway.listByCustomer(), OWNER) ?? gateway.create(ref).id;

  // O vínculo é gravado imediatamente, antes de qualquer outro passo.
  local.asaas_subscription_id = subscriptionId;
  if (opts.failLocalWrite) return { subscriptionId, local };

  local.status = 'trial';
  local.trial_ends_at = new Date(opts.now + TRIAL_DAYS * DAY_MS).toISOString();
  return { subscriptionId, local };
}

/** Passo webhook PAYMENT_CONFIRMED. */
function applyPaymentConfirmed(local: LocalSub, ref: string, paidAt: Date): LocalSub {
  const { months } = parseSubscriptionReference(ref);
  const end = paidPeriodEnd(paidAt, months ?? 1);
  return { ...local, status: 'active', current_period_end: end.toISOString() };
}

let gateway: FakeAsaas;
let local: LocalSub;

beforeEach(() => {
  gateway = new FakeAsaas();
  local = { status: 'pending', trial_ends_at: null, current_period_end: null, asaas_subscription_id: null };
});

describe('assinatura Asaas — fluxo ponta a ponta', () => {
  it('cartão cadastrado libera o app em teste gratuito e o pagamento confirmado ativa a conta', () => {
    const now = Date.now();
    expect(grantsAppAccess(local as never, now)).toBe(false);

    const { subscriptionId } = subscribeWithCard(gateway, local, { seats: 5, months: 1, now });
    expect(gateway.created).toBe(1);
    expect(subscriptionId).toBe('sub_1');
    expect(local.status).toBe('trial');
    // Usuário NÃO fica bloqueado após cadastrar o cartão.
    expect(grantsAppAccess(local as never, now)).toBe(true);

    const paidAt = new Date(now + TRIAL_DAYS * DAY_MS);
    const active = applyPaymentConfirmed(local, gateway.subs[0].externalReference, paidAt);
    expect(active.status).toBe('active');
    expect(new Date(active.current_period_end!).getTime()).toBeGreaterThan(paidAt.getTime());
    expect(grantsAppAccess(active as never, paidAt.getTime())).toBe(true);
  });

  it('externalReference carrega dono, plano e ciclo para o webhook identificar a conta', () => {
    const ref = subscriptionExternalReference(OWNER, 10, 12);
    expect(parseSubscriptionReference(ref)).toEqual({ ownerUserId: OWNER, seats: 10, months: 12 });
    expect(paidPeriodEnd(new Date('2026-01-31T12:00:00Z'), 12).getUTCFullYear()).toBe(2027);
  });
});

describe('assinatura Asaas — idempotência (sem cobrança duplicada)', () => {
  it('nova tentativa após falha local reaproveita a assinatura do gateway', () => {
    const now = Date.now();
    // 1ª tentativa: cria no gateway, mas a gravação completa falha.
    subscribeWithCard(gateway, local, { seats: 5, months: 1, failLocalWrite: true, now });
    expect(gateway.created).toBe(1);

    // 2ª tentativa (usuário clica de novo), agora sem o vínculo local.
    local.asaas_subscription_id = null;
    const retry = subscribeWithCard(gateway, local, { seats: 5, months: 1, now });
    expect(gateway.created).toBe(1); // nada foi criado de novo
    expect(retry.subscriptionId).toBe('sub_1');
    expect(grantsAppAccess(retry.local as never, now)).toBe(true);
  });

  it('não reaproveita assinatura de outra conta, cancelada ou removida', () => {
    const other = subscriptionExternalReference('22222222-2222-4222-8222-222222222222', 5, 1);
    expect(pickReusableSubscription([{ id: 'x', status: 'ACTIVE', externalReference: other }], OWNER)).toBeNull();

    const mine = subscriptionExternalReference(OWNER, 5, 1);
    expect(pickReusableSubscription([{ id: 'x', status: 'INACTIVE', externalReference: mine }], OWNER)).toBeNull();
    expect(
      pickReusableSubscription([{ id: 'x', status: 'ACTIVE', externalReference: mine, deleted: true }], OWNER),
    ).toBeNull();
    expect(pickReusableSubscription([{ id: 'ok', status: 'OVERDUE', externalReference: mine }], OWNER)).toBe('ok');
  });
});
