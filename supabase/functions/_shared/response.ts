import { corsHeaders } from "./cors.ts";

/** Resposta JSON com CORS — incluir em TODAS as respostas, inclusive erros. */
export function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
