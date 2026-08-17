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

  // Confirmação exige resposta objetiva. Cortesias genéricas ("ok", "obrigada",
  // "beleza", "show") NÃO confirmam presença — antes disso qualquer mensagem do
  // cliente confirmava o horário indevidamente.
  if (/^(1|1\)|1-|opcao 1|confirmar|confirmo|confirmado|confirmada|confirma|sim|estarei|estou|presente|vou sim|pode manter|mantenho|manter|combinado|confirmando)\b/.test(text)) return 'confirm';
  if (/^(2|2\)|2-|opcao 2|cancelar|cancelo|cancelado|cancelada|cancela|nao|nao posso|nao vou|nao consigo|nao da|desmarcar|desmarca|desmarque|remarcar|remarca|remarque|adiar)\b/.test(text)) return 'cancel';

  if (/\bcancel/.test(text) || /\bdesmarc/.test(text) || /\bremarc/.test(text) || /\badiar\b/.test(text)) return 'cancel';
  if (/\bconfirm/.test(text)) return 'confirm';

  if (CONFIRM_EMOJI.some((e) => original.includes(e))) return 'confirm';
  if (CANCEL_EMOJI.some((e) => original.includes(e))) return 'cancel';
  return null;
}

/** Frases usadas nas respostas automáticas do próprio sistema. */
const SYSTEM_MESSAGE_MARKERS = [
  'presenca confirmada',
  'cancelado.',
  'nao entendi sua resposta',
  'nao encontramos um horario ativo',
  'quando quiser reagendar',
  'responda *1*',
  'responda 1 para confirmar',
  'seu horario:',
  'lembrete do seu horario',
];

/**
 * Detecta se a mensagem recebida é apenas o eco de uma mensagem automática do
 * próprio sistema (acontece quando duas instâncias da mesma conta conversam).
 */
export function isEchoOfSystemMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return SYSTEM_MESSAGE_MARKERS.some((m) => text.includes(m));
}

// ===================== Regras de resposta automática =====================

/** Horas após o convite em que uma resposta livre ainda é tratada como resposta. */
export const CLARIFY_WINDOW_HOURS = 12;
/** Horas em que uma intenção explícita (1/2) ainda é aceita. */
export const INTENT_WINDOW_HOURS = 48;

export interface ReplyCandidate {
  id: string;
  status: string;
  start_time: string;
  confirmation_token?: string | null;
  /** momento do último convite de confirmação enviado (ISO) */
  invited_at?: string | null;
}

export type ReplyDecision =
  | { action: 'apply_intent'; appointmentId: string }
  | { action: 'already_confirmed'; appointmentId: string }
  | { action: 'ask_clarification'; appointmentId: string }
  | { action: 'silent'; reason: 'no_pending_confirmation' | 'intent_unclear_silenced' | 'settled' };

/** true quando o horário ainda aguarda a resposta do cliente. */
export function isPendingConfirmation(status: string): boolean {
  return String(status || '').toLowerCase() === 'scheduled';
}

/**
 * Decide o que fazer com uma mensagem recebida.
 *
 * Regras:
 *  - Intenção explícita (1/2) é aplicada em horários pendentes ou confirmados
 *    dentro da janela de 48h; horário já confirmado que recebe "1" apenas
 *    recebe um aviso curto.
 *  - A pergunta "Não entendi sua resposta" só é enviada quando existe horário
 *    PENDENTE com convite recente (12h) e ainda não foi perguntado antes.
 *  - Horário confirmado/cancelado nunca gera pergunta automática.
 */
export function decideReplyAction(params: {
  intent: ConfirmIntent | null;
  candidates: ReplyCandidate[];
  /** ids de agendamentos que já receberam a pergunta de esclarecimento */
  alreadyClarifiedIds?: string[];
  now?: number;
}): ReplyDecision {
  const now = params.now ?? Date.now();
  const clarified = new Set(params.alreadyClarifiedIds ?? []);
  const withinHours = (iso: string | null | undefined, hours: number) => {
    if (!iso) return false;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) && now - ms <= hours * 3600 * 1000;
  };

  const invitedIntent = params.candidates.filter((c) => withinHours(c.invited_at, INTENT_WINDOW_HOURS));
  const pending = invitedIntent.filter((c) => isPendingConfirmation(c.status));
  const confirmed = invitedIntent.filter((c) => String(c.status).toLowerCase() === 'confirmed');

  if (params.intent) {
    const target = pending[0];
    if (target) return { action: 'apply_intent', appointmentId: target.id };
    const conf = confirmed[0];
    if (conf) {
      return params.intent === 'confirm'
        ? { action: 'already_confirmed', appointmentId: conf.id }
        : { action: 'apply_intent', appointmentId: conf.id };
    }
    return { action: 'silent', reason: 'no_pending_confirmation' };
  }

  const clarifyTarget = pending.find((c) => withinHours(c.invited_at, CLARIFY_WINDOW_HOURS));
  if (!clarifyTarget) {
    return { action: 'silent', reason: pending.length || confirmed.length ? 'settled' : 'no_pending_confirmation' };
  }
  if (clarified.has(clarifyTarget.id)) {
    return { action: 'silent', reason: 'intent_unclear_silenced' };
  }
  return { action: 'ask_clarification', appointmentId: clarifyTarget.id };
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
