// Gera um resumo organizado das observações livres de uma consulta.
// Recebe { client_id, notes } e devolve o resumo em texto puro, em streaming.
import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NOUNS: Record<string, string> = {
  barbearia: "barbearia", salao: "salão de beleza", odontologia: "consultório odontológico",
  psicologia: "consultório de psicologia", fisioterapia: "clínica de fisioterapia",
  fonoaudiologia: "consultório de fonoaudiologia", nutricao: "consultório de nutrição",
  estetica: "clínica de estética", podologia: "clínica de podologia", veterinaria: "clínica veterinária",
  terapia: "espaço de terapias", spa: "spa", consultorio: "consultório", clinica: "clínica",
};

function instructions(area: string) {
  return `Você organiza anotações de atendimento de um(a) ${area}.
Reescreva as observações do profissional em um resumo claro, em português do Brasil, usando EXATAMENTE estas seções, nesta ordem, cada título em uma linha própria terminando com dois-pontos:
Queixa / motivo do atendimento:
Procedimentos realizados:
Observações e achados:
Orientações ao cliente:
Próximos passos / retorno:
Pontos de atenção:
Regras: use apenas o que está nas observações; nunca invente dados, diagnósticos, doses ou datas. Quando uma seção não tiver informação, escreva "Não informado". Use frases curtas ou itens com "- ". Em "Pontos de atenção" destaque alergias, contraindicações e riscos mencionados. Não use markdown além de "- ". Não acrescente comentários antes ou depois.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });

  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "Faça login para continuar." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u, error: uErr } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json(401, { error: "Sessão expirada. Entre novamente." });

  let body: { client_id?: string; notes?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Pedido inválido." }); }
  const notes = (body.notes ?? "").trim();
  const clientId = body.client_id ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json(400, { error: "Cliente inválido." });
  if (notes.length < 10) return json(400, { error: "Escreva um pouco mais nas observações antes de gerar o resumo." });
  if (notes.length > 20000) return json(400, { error: "As observações estão muito longas. Reduza o texto e tente de novo." });

  // Acesso à ficha do cliente (RLS decide).
  const { data: client } = await sb.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return json(403, { error: "Você não tem acesso à ficha deste cliente." });

  const { data: bs } = await sb.from("business_settings").select("business_type, business_type_label").limit(1).maybeSingle();
  const area = (bs?.business_type === "outro" && bs?.business_type_label) || NOUNS[bs?.business_type ?? ""] || "estabelecimento de atendimento";

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json(500, { error: "O recurso de IA não está configurado." });

  let upstream: Response;
  try {
    const runId = req.headers.get("X-Lovable-AIG-Run-ID");
    upstream = await fetch(GATEWAY, {
      method: "POST",
      signal: req.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
        ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        input: [
          { role: "system", content: instructions(area) },
          { role: "user", content: `Observações da consulta:\n\n${notes}` },
        ],
      }),
    });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: cors });
    console.error("gateway fetch failed", e);
    return json(502, { error: "A IA está indisponível agora. Tente novamente em instantes." });
  }

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    console.error("gateway error", upstream.status, txt.slice(0, 500));
    const msg =
      upstream.status === 402 ? "Os créditos de IA acabaram. Adicione créditos em Configurações → Planos e créditos no Lovable."
      : upstream.status === 429 ? "A IA está ocupada. Tente novamente em instantes."
      : upstream.status === 403 ? "O uso da IA está bloqueado para esta conta no momento."
      : "Não foi possível gerar o resumo agora. Tente novamente em instantes.";
    return json(upstream.status === 402 || upstream.status === 403 || upstream.status === 429 ? upstream.status : 502, { error: msg });
  }

  // Converte o SSE da IA em texto puro (só o conteúdo do resumo).
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  let sawText = false;
  const out = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta" && ev.delta) { sawText = true; ctl.enqueue(enc.encode(ev.delta)); }
          else if (ev.type === "response.failed" || ev.type === "error") ctl.enqueue(enc.encode("\n[[ERRO]]"));
        } catch { /* fragmento incompleto */ }
      }
    },
    flush(ctl) { if (!sawText) ctl.enqueue(enc.encode("[[VAZIO]]")); },
  });

  const headers = new Headers({ ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  const rid = upstream.headers.get("X-Lovable-AIG-Run-ID");
  if (rid) headers.set("X-Lovable-AIG-Run-ID", rid);
  return new Response(upstream.body.pipeThrough(out), { headers });
});
