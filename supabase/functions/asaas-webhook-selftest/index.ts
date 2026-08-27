// Função TEMPORÁRIA de diagnóstico: dispara um evento sintético no webhook do
// Asaas usando o token real (ASAAS_WEBHOOK_TOKEN) sem nunca expor o valor.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async () => {
  const token = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "").trim();
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`;
  const eventId = `selftest-${crypto.randomUUID()}`;
  const body = JSON.stringify({
    id: eventId,
    event: "PAYMENT_CONFIRMED",
    payment: { id: `pay_selftest_${eventId}`, value: 1, customer: "cus_selftest_inexistente" },
  });

  const withToken = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body,
  });
  const withTokenBody = await withToken.text();

  // repete o mesmo evento para provar a idempotência
  const repeat = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body,
  });
  const repeatBody = await repeat.text();

  const withBad = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "token-errado" },
    body,
  });
  const withBadBody = await withBad.text();

  return new Response(
    JSON.stringify({
      tokenConfigured: token.length > 0,
      eventId,
      validToken: { status: withToken.status, body: withTokenBody },
      duplicate: { status: repeat.status, body: repeatBody },
      invalidToken: { status: withBad.status, body: withBadBody },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
