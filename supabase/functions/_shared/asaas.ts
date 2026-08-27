// Integração com o Asaas — meio oficial de recebimento das assinaturas Hora Pro.
//
// Regras:
// - A chave da API fica APENAS no segredo ASAAS_API_KEY (nunca no código).
// - ASAAS_ENV controla o ambiente: "sandbox" (testes) ou "production".
// - Os valores/descontos são definidos por você no painel do Asaas; o app lê.

export function asaasBaseUrl(): string {
  const override = Deno.env.get("ASAAS_API_BASE_URL")?.trim().replace(/\/+$/, "");
  if (override) return override;
  const env = (Deno.env.get("ASAAS_ENV") || "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox.asaas.com/api/v3"
    : "https://api.asaas.com/v3";
}

export function asaasApiKey(): string {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
}

/** Chamada à API do Asaas com erro legível (status + corpo do provedor). */
export async function asaasFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: asaasApiKey(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[asaas] ${init.method ?? "GET"} ${path} falhou [${res.status}]: ${text}`);
    throw new Error(`Asaas ${res.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Ciclos suportados: meses → cycle do Asaas. */
export const CYCLE_BY_MONTHS: Record<number, string> = {
  1: "MONTHLY",
  6: "SEMIANNUALLY",
  12: "YEARLY",
};

export const MONTHS_BY_CYCLE: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  YEARLY: 12,
};

/**
 * externalReference usada em cliente/assinatura/cobrança.
 * Guarda o dono da conta, os assentos e o ciclo — é assim que o webhook sabe
 * quem liberar e por quanto tempo, sem depender de nenhuma outra consulta.
 */
export function buildExternalReference(
  userId: string,
  seats: number,
  months: number,
): string {
  return `user:${userId}|seats:${seats}|months:${months}`;
}

export interface ParsedReference {
  userId: string | null;
  seats: number | null;
  months: number | null;
}

export function parseExternalReference(ref?: string | null): ParsedReference {
  const out: ParsedReference = { userId: null, seats: null, months: null };
  if (!ref) return out;
  for (const part of ref.split("|")) {
    const [k, v] = part.split(":");
    if (k === "user" && v) out.userId = v;
    if (k === "seats" && v && Number.isFinite(Number(v))) out.seats = Number(v);
    if (k === "months" && v && Number.isFinite(Number(v))) out.months = Number(v);
  }
  return out;
}

/** Só dígitos (CPF/CNPJ e telefone no Asaas). */
export function onlyDigits(value?: string | null): string {
  return (value ?? "").replace(/\D+/g, "");
}
