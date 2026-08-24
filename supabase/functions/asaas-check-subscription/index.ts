// Confere no Asaas, sob demanda, se a assinatura da conta está paga e atualiza
// public.account_subscriptions. Usada no retorno da tela de sucesso e no botão
// "Atualizar status" — o acesso não depende só do webhook.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  asaasFetch,
  MONTHS_BY_CYCLE,
  parseExternalReference,
} from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

interface AsaasPaymentRow {
  id: string;
  status: string;
  value?: number;
  confirmedDate?: string | null;
  paymentDate?: string | null;
  dueDate?: string | null;
  externalReference?: string | null;
}

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Faça login para continuar." }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Sessão inválida." }, 401);

    const { data: row } = await admin
      .from("account_subscriptions")
      .select("id, status, asaas_subscription_id, asaas_customer_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!row?.asaas_subscription_id && !row?.asaas_customer_id) {
      return json({ subscribed: false, reason: "sem_assinatura" });
    }

    // Cobranças da assinatura (ou do cliente, se a assinatura não estiver salva).
    const path = row.asaas_subscription_id
      ? `/subscriptions/${row.asaas_subscription_id}/payments?limit=20`
      : `/payments?customer=${row.asaas_customer_id}&limit=20`;
    const payments = await asaasFetch<{ data: AsaasPaymentRow[] }>(path);

    const paid = (payments?.data ?? [])
      .filter((p) => PAID.has(p.status))
      .sort((a, b) =>
        new Date(b.confirmedDate ?? b.paymentDate ?? 0).getTime() -
        new Date(a.confirmedDate ?? a.paymentDate ?? 0).getTime()
      )[0];

    // Ciclo e assentos: externalReference da cobrança ou da assinatura.
    let ref = parseExternalReference(paid?.externalReference ?? null);
    let months = ref.months ?? null;
    if (row.asaas_subscription_id && (!ref.userId || !months || !ref.seats)) {
      try {
        const sub = await asaasFetch<{ externalReference?: string | null; cycle?: string }>(
          `/subscriptions/${row.asaas_subscription_id}`,
        );
        const subRef = parseExternalReference(sub.externalReference);
        ref = {
          userId: ref.userId ?? subRef.userId,
          seats: ref.seats ?? subRef.seats,
          months: ref.months ?? subRef.months,
        };
        months = months ?? ref.months ?? (sub.cycle ? MONTHS_BY_CYCLE[sub.cycle] ?? null : null);
      } catch (e) {
        console.warn("[asaas-check-subscription] assinatura não lida:", e);
      }
    }

    if (!paid) {
      const overdue = (payments?.data ?? []).some((p) => p.status === "OVERDUE");
      if (overdue && row.status === "active") {
        await admin.from("account_subscriptions")
          .update({ status: "past_due" })
          .eq("owner_user_id", user.id);
      }
      return json({ subscribed: false, pending: !overdue, overdue });
    }

    const paidAt = new Date(paid.confirmedDate ?? paid.paymentDate ?? Date.now());
    const end = new Date(paidAt.getTime());
    end.setMonth(end.getMonth() + (months ?? 1));

    const patch: Record<string, unknown> = {
      payment_provider: "asaas",
      status: end.getTime() > Date.now() ? "active" : "past_due",
      current_period_end: end.toISOString(),
      asaas_payment_id: paid.id,
    };
    if (ref.seats) {
      patch.seat_limit = ref.seats;
      patch.plan_tier = ref.seats;
    }
    const { error } = await admin
      .from("account_subscriptions")
      .update(patch)
      .eq("owner_user_id", user.id);
    if (error) console.error("[asaas-check-subscription] update falhou:", error.message);

    return json({
      subscribed: patch.status === "active",
      seats: ref.seats ?? null,
      current_period_end: end.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-check-subscription] erro:", message);
    return json({ error: message }, 500);
  }
});
