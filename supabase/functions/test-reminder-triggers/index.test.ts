/**
 * E2E test: dispara a edge function `test-reminder-triggers`, que executa
 * server-side (com service role) os 3 cenários:
 *   1. Excluir agendamento  → fila esvaziada.
 *   2. Cancelar status      → linha pendente vira `cancelled`.
 *   3. Editar `start_time`  → fila + log apagados (gera novo no próximo cron).
 *
 * O Deno test só precisa do anon key + URL — credenciais reais ficam
 * no edge function. Para autorizar, define-se um header `x-e2e-secret`
 * (precisa estar configurado como secret `E2E_TEST_SECRET`); na ausência,
 * o teste é pulado para não bloquear o build.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const ANON =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  "";
const E2E_SECRET = Deno.env.get("E2E_TEST_SECRET") ?? "";

const skip = !SUPABASE_URL || !ANON || !E2E_SECRET;
if (skip) {
  console.warn(
    "[reminder-triggers.e2e] Faltam SUPABASE_URL/ANON/E2E_TEST_SECRET; testes pulados.",
  );
}

interface ScenarioResult {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
  error?: string;
}

async function runScenarios(): Promise<{ ok: boolean; scenarios: ScenarioResult[] }> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/test-reminder-triggers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-e2e-secret": E2E_SECRET,
    },
  });
  const text = await r.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (![200, 500].includes(r.status)) {
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  if (!body.scenarios) {
    throw new Error(`Resposta inesperada (status ${r.status}): ${text}`);
  }
  return body;
}

let cached: { ok: boolean; scenarios: ScenarioResult[] } | null = null;
async function getResults() {
  if (!cached) cached = await runScenarios();
  return cached;
}

Deno.test({
  name: "E2E: DELETE de agendamento remove lembrete pendente da fila",
  ignore: skip,
  async fn() {
    const { scenarios } = await getResults();
    const s = scenarios.find((x) => x.name.includes("DELETE"));
    assert(s, "cenário DELETE não retornado");
    if (!s!.passed) console.error(s);
    assertEquals(s!.passed, true, s!.error ?? JSON.stringify(s!.details));
  },
});

Deno.test({
  name: "E2E: Cancelar agendamento marca lembrete pendente como cancelled",
  ignore: skip,
  async fn() {
    const { scenarios } = await getResults();
    const s = scenarios.find((x) => x.name.toLowerCase().includes("cancelar"));
    assert(s, "cenário Cancelar não retornado");
    if (!s!.passed) console.error(s);
    assertEquals(s!.passed, true, s!.error ?? JSON.stringify(s!.details));
  },
});

Deno.test({
  name: "E2E: Editar horário limpa fila + log para regerar com novo horário",
  ignore: skip,
  async fn() {
    const { scenarios } = await getResults();
    const s = scenarios.find((x) => x.name.toLowerCase().includes("editar"));
    assert(s, "cenário Editar não retornado");
    if (!s!.passed) console.error(s);
    assertEquals(s!.passed, true, s!.error ?? JSON.stringify(s!.details));
  },
});
