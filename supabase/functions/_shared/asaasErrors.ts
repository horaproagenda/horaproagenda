// Traduz o erro bruto do Asaas ("Asaas 400: {...}") em uma mensagem clara
// para quem está cadastrando o cartão — sem códigos nem jargão técnico.

interface AsaasErrorItem {
  code?: string;
  description?: string;
}

/** Extrai as descrições enviadas pelo Asaas dentro da mensagem de erro. */
export function extractAsaasDescriptions(message: string): string[] {
  const start = message.indexOf("{");
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(message.slice(start)) as { errors?: AsaasErrorItem[] };
    return (parsed.errors ?? [])
      .map((e) => (typeof e.description === "string" ? e.description.trim() : ""))
      .filter((d) => d.length > 0);
  } catch {
    return [];
  }
}

const RULES: Array<{ match: RegExp; text: string }> = [
  {
    match: /contato com DDD|telefone/i,
    text: "Informe o telefone do titular com DDD (por exemplo 11 99999-9999).",
  },
  { match: /CEP|postalCode/i, text: "O CEP do titular está inválido. Confira e tente novamente." },
  { match: /cpf|cnpj/i, text: "O CPF ou CNPJ do titular está inválido." },
  { match: /n[úu]mero do endere[çc]o|addressNumber/i, text: "Informe o número do endereço do titular." },
  {
    match: /recusad|n[ãa]o autorizad|denied|declined|insufficient|saldo/i,
    text: "O cartão foi recusado pelo banco emissor. Tente outro cartão ou fale com o seu banco.",
  },
  { match: /expira|validade/i, text: "A validade do cartão está incorreta ou o cartão está vencido." },
  { match: /ccv|c[óo]digo de seguran[çc]a/i, text: "O código de segurança (CVV) está incorreto." },
];

/**
 * Mensagem amigável para o usuário final. Quando o Asaas explica o motivo,
 * repassamos esse motivo traduzido; caso contrário, devolvemos o texto do
 * provedor (que já vem em português) sem códigos HTTP.
 */
export function friendlyAsaasError(message: string, fallback: string): string {
  if (!message.startsWith("Asaas")) return message;
  const descriptions = extractAsaasDescriptions(message);
  const mapped = descriptions
    .map((d) => RULES.find((r) => r.match.test(d))?.text ?? d)
    .filter((d, i, arr) => arr.indexOf(d) === i);
  if (mapped.length > 0) return mapped.join(" ");
  return fallback;
}
