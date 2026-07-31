/**
 * Extrai a mensagem real de erro de uma Edge Function.
 *
 * `supabase.functions.invoke` devolve apenas
 * "Edge Function returned a non-2xx status code" para qualquer resposta 4xx/5xx.
 * O corpo JSON fica em `error.context`, então precisamos lê-lo para mostrar a
 * mensagem correta ao usuário (e-mail já cadastrado, cooldown, etc.).
 */
export interface EdgeErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export async function readEdgeFunctionError(error: unknown): Promise<EdgeErrorPayload | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context;
  if (!ctx) return null;
  try {
    if (typeof ctx.json === 'function') {
      const json = await ctx.json();
      if (json && typeof json === 'object') return json as EdgeErrorPayload;
    }
  } catch {
    /* corpo não-JSON — tenta texto abaixo */
  }
  try {
    if (typeof ctx.text === 'function') {
      const text = await ctx.text();
      if (text) {
        try {
          return JSON.parse(text) as EdgeErrorPayload;
        } catch {
          return { error: text.slice(0, 300) };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Mensagem legível para o usuário a partir de um erro de edge function. */
export async function edgeErrorMessage(error: unknown, fallback = 'Erro inesperado'): Promise<string> {
  const payload = await readEdgeFunctionError(error);
  const msg = payload?.error || payload?.message;
  if (msg) return String(msg);
  const raw = error instanceof Error ? error.message : '';
  if (!raw || /non-2xx/i.test(raw)) return fallback;
  return raw;
}

/** Códigos que indicam e-mail já registrado (variam entre funções). */
export const EMAIL_EXISTS_CODES = ['email_exists', 'email_already_registered', 'user_already_exists'];

export function isEmailExistsCode(code?: unknown): boolean {
  return typeof code === 'string' && EMAIL_EXISTS_CODES.includes(code);
}
