/**
 * Leitura das respostas de confirmação recebidas no WhatsApp.
 * Funções puras (sem dependências de runtime) para poderem ser testadas.
 */

export type ConfirmIntent = 'confirm' | 'cancel';

function normalizeText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONFIRM_EMOJI = ['✅', '👍', '🙏', '👌', '☑️', '✔️', '🆗'];
const CANCEL_EMOJI = ['❌', '👎', '🚫', '✖️'];

/** Detecta a intenção de uma resposta livre. Retorna 'confirm' | 'cancel' | null. */
export function detectIntent(body: string): ConfirmIntent | null {
  const original = String(body || '');
  const text = normalizeText(original);
  if (!text) {
    if (CONFIRM_EMOJI.some((e) => original.includes(e))) return 'confirm';
    if (CANCEL_EMOJI.some((e) => original.includes(e))) return 'cancel';
    return null;
  }

  // Negações explícitas têm prioridade ("não vou poder confirmar")
  if (/\bnao\b.*\b(vou|posso|consigo|da|dara|poderei|comparecer|ir)\b/.test(text)) return 'cancel';
  if (/\b(nao|n)\s*(quero|desejo)?\s*(confirm)/.test(text)) return 'cancel';

  if (/^(1|1\)|1-|opcao 1|confirmar|confirmo|confirmado|confirmada|confirma|sim|s|ok|okay|okey|oka|presente|vou|estarei|vou sim|pode ser|pode manter|mantenho|manter|beleza|blz|show|otimo|otima|perfeito|isso|claro|certo|combinado|positivo)\b/.test(text)) return 'confirm';
  if (/^(2|2\)|2-|opcao 2|cancelar|cancelo|cancelado|cancelada|cancela|nao|n|nao posso|nao vou|nao consigo|nao da|desmarcar|desmarca|desmarque|remarcar|remarca|remarque|adiar|negativo)\b/.test(text)) return 'cancel';

  if (/\bcancel/.test(text) || /\bdesmarc/.test(text) || /\bremarc/.test(text) || /\badiar\b/.test(text)) return 'cancel';
  if (/\bconfirm/.test(text)) return 'confirm';

  if (CONFIRM_EMOJI.some((e) => original.includes(e))) return 'confirm';
  if (CANCEL_EMOJI.some((e) => original.includes(e))) return 'cancel';
  return null;
}

/** Só os dígitos de um telefone/JID. */
export function onlyDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/** Normaliza um telefone brasileiro para o formato do WhatsApp (5531999999999). */
export function normalizePhone(phone: string): string {
  let d = onlyDigits(phone);
  if (d.startsWith('0')) d = d.substring(1);
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return d;
}

/**
 * Chave de comparação tolerante: usa os últimos 8 dígitos, que são estáveis
 * mesmo quando o número chega sem DDI, sem o nono dígito ou com formatações
 * diferentes.
 */
export function phoneMatchKey(phone: string): string {
  const d = onlyDigits(phone);
  return d.length >= 8 ? d.slice(-8) : d;
}

export function phonesMatch(a: string, b: string): boolean {
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  return !!ka && ka.length >= 8 && ka === kb;
}

/**
 * Extrai o número real do remetente. O WhatsApp pode entregar o JID no
 * formato novo (`<id>@lid`), que não é um telefone: nesses casos usamos os
 * campos alternativos enviados no mesmo evento.
 */
export function extractSenderPhone(data: any): string | null {
  const candidates = [
    data?.key?.remoteJidAlt,
    data?.key?.senderPn,
    data?.senderPn,
    data?.senderPhone,
    data?.key?.remoteJid,
    data?.remoteJid,
    data?.from,
    data?.phone,
    data?.chatId,
    data?.author,
    data?.key?.participant,
    data?.participant,
  ];
  for (const raw of candidates) {
    const value = String(raw || '');
    if (!value) continue;
    if (/@(g\.us|broadcast)/i.test(value)) continue; // grupos/status não confirmam
    if (/@lid$/i.test(value)) continue; // identificador interno, não é telefone
    const digits = onlyDigits(value.replace(/@.*/, ''));
    if (digits.length >= 8) return normalizePhone(digits);
  }
  return null;
}

/** Texto da mensagem em qualquer um dos formatos entregues pela Evolution API. */
export function extractMessageText(data: any): string {
  const m = data?.message || {};
  return String(
    data?.body ||
    data?.text ||
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.buttonsResponseMessage?.selectedDisplayText ||
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.templateButtonReplyMessage?.selectedDisplayText ||
    m?.templateButtonReplyMessage?.selectedId ||
    m?.listResponseMessage?.title ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.reactionMessage?.text ||
    m?.text ||
    '',
  );
}
