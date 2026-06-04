// Deno test — validates that stripe-webhook rejects requests without/with bad signatures.
// Run with: deno test --allow-net --allow-env supabase/functions/stripe-webhook/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const PROJECT_REF = Deno.env.get("VITE_SUPABASE_PROJECT_ID") ?? "nsgcllrbswodjoadybsj";
const FN_URL = `https://${PROJECT_REF}.functions.supabase.co/stripe-webhook`;

Deno.test("stripe-webhook: rejects without signature header", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ping" }),
  });
  const body = await res.text();
  assertEquals(res.status, 400, `expected 400, got ${res.status}: ${body}`);
});

Deno.test("stripe-webhook: rejects with invalid signature", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=invalid",
    },
    body: JSON.stringify({ id: "evt_test", type: "ping", data: { object: {} } }),
  });
  const body = await res.text();
  assertEquals(res.status, 400, `expected 400, got ${res.status}: ${body}`);
});

Deno.test("stripe-webhook: OPTIONS returns CORS preflight", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
});
