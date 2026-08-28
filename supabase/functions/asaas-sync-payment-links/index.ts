// Publica no Asaas os planos do app como links de assinatura.
//
// 8 pacotes de usuários × 3 ciclos = 24 links, cada um aceitando cartão de
// crédito, cartão de débito, Pix e boleto (billingType UNDEFINED).
//
// Idempotente: antes de criar, procura no Asaas um link com a mesma chave
// (`plan:seats:<n>|months:<m>`) e apenas atualiza valor/nome/ciclo. Rodar duas
// vezes não duplica nada.
//
// Segurança: JWT obrigatório e somente super_admin.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { asaasFetch } from "../_shared/asaas.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { response } from "../_shared/response.ts";
import {
  buildPlanLinkCatalog,
  pickReusablePaymentLink,
  planLinkPayload,
  type RemotePaymentLinkLike,
} from "../_shared/asaasPlanLinks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Todos os links do Asaas (paginado). */
async function listAllPaymentLinks(): Promise<RemotePaymentLinkLike[]> {
  const all: RemotePaymentLinkLike[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const batch = await asaasFetch<{ data?: RemotePaymentLinkLike[]; hasMore?: boolean }>(
      `/paymentLinks?limit=100&offset=${offset}`,
    );
    const rows = batch.data ?? [];
    all.push(...rows);
    if (!batch.hasMore || rows.length === 0) break;
    offset += rows.length;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return response(401, { error: "unauthorized" });

    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return response(401, { error: "unauthorized" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: isSuper, error: roleErr } = await admin.rpc("is_super_admin", {
      _user_id: user.id,
    });
    if (roleErr) return response(500, { error: roleErr.message });
    if (!isSuper) return response(403, { error: "forbidden" });

    const catalog = buildPlanLinkCatalog();
    const existing = await listAllPaymentLinks();

    const results: Array<{
      seats: number;
      months: number;
      action: "created" | "updated" | "failed";
      url?: string | null;
      message?: string;
    }> = [];

    for (const def of catalog) {
      const payload = planLinkPayload(def);
      const match = pickReusablePaymentLink(existing, def);
      try {
        let linkId = match?.id ?? null;
        let url = match?.url ?? null;
        let action: "created" | "updated" = "created";

        if (linkId) {
          const updated = await asaasFetch<{ id: string; url?: string }>(
            `/paymentLinks/${linkId}`,
            { method: "POST", body: JSON.stringify(payload) },
          );
          linkId = updated.id ?? linkId;
          url = updated.url ?? url;
          action = "updated";
        } else {
          const created = await asaasFetch<{ id: string; url?: string }>("/paymentLinks", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          linkId = created.id;
          url = created.url ?? null;
          existing.push({ id: created.id, url, ...payload } as RemotePaymentLinkLike);
        }

        const { error: upsertErr } = await admin
          .from("billing_payment_links")
          .upsert(
            {
              seats: def.seats,
              billing_months: def.months,
              cycle_key: def.cycleKey,
              total_cents: def.totalCents,
              asaas_payment_link_id: linkId,
              url,
              active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "seats,billing_months" },
          );
        if (upsertErr) throw new Error(upsertErr.message);

        results.push({ seats: def.seats, months: def.months, action, url });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(
          `[asaas-sync-payment-links] plano ${def.seats}/${def.months}m falhou:`,
          message,
        );
        results.push({ seats: def.seats, months: def.months, action: "failed", message });
      }
    }

    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;
    const failed = results.filter((r) => r.action === "failed").length;

    return response(failed > 0 && created + updated === 0 ? 502 : 200, {
      total: catalog.length,
      created,
      updated,
      failed,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-sync-payment-links] erro:", message);
    return response(500, { error: message });
  }
});
