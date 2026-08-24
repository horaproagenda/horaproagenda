// Devolve o link de pagamento da fatura em aberto da conta no Asaas.
// Substitui o antigo "portal do cliente": o assinante paga/atualiza a cobrança
// pendente (Pix, cartão ou boleto) direto na fatura do Asaas.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { asaasFetch } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

interface Payment {
  id: string;
  status: string;
  dueDate?: string;
  invoiceUrl?: string;
}

const OPEN = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);

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
      .select("asaas_subscription_id, asaas_customer_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!row?.asaas_subscription_id && !row?.asaas_customer_id) {
      return json({
        error: "Nenhuma assinatura encontrada. Escolha um plano para começar.",
        need_subscription: true,
      }, 404);
    }

    const path = row.asaas_subscription_id
      ? `/subscriptions/${row.asaas_subscription_id}/payments?limit=20`
      : `/payments?customer=${row.asaas_customer_id}&limit=20`;
    const payments = await asaasFetch<{ data: Payment[] }>(path);

    const open = (payments?.data ?? [])
      .filter((p) => OPEN.has(p.status) && p.invoiceUrl)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

    if (!open?.invoiceUrl) {
      return json({
        error: "Não há fatura em aberto no momento.",
        need_subscription: false,
      }, 404);
    }

    return json({ url: open.invoiceUrl, payment_id: open.id, status: open.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-invoice-url] erro:", message);
    return json({ error: message }, 500);
  }
});
