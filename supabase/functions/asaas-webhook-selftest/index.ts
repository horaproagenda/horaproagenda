// Função TEMPORÁRIA de diagnóstico: dispara um evento sintético no webhook do
// Asaas usando o token real (ASAAS_WEBHOOK_TOKEN) sem nunca expor o valor.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async (req) => {
  const token = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "").trim();
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`;
  let input: { event?: string; externalReference?: string; value?: number } = {};
  try {
    input = await req.json();
  } catch { /* sem corpo: teste padrão */ }

  const eventId = `selftest-${crypto.randomUUID()}`;
  const body = JSON.stringify({
    id: eventId,
    event: input.event ?? "PAYMENT_CONFIRMED",
    payment: {
      id: `pay_${eventId}`,
      value: input.value ?? 1,
      externalReference: input.externalReference ?? null,
      confirmedDate: new Date().toISOString().slice(0, 10),
    },
  });

  const post = (t: string) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "asaas-access-token": t },
      body,
    });

  const withToken = await post(token);
  const withTokenBody = await withToken.text();
  const repeat = await post(token);
  const repeatBody = await repeat.text();
  const withBad = await post("token-errado");
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
