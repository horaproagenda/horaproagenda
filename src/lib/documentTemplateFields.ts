export type DocumentFieldToken =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string; fieldKey: string; label?: string }
  | { type: 'yesno'; fieldKey: string; label: string }
  | { type: 'freeText'; fieldKey: string; label: string }
  | { type: 'blankField'; fieldKey: string; label: string }
  | { type: 'checkbox'; fieldKey: string; label: string };

export interface DocumentPrefillSnapshot {
  client?: {
    id: string | null;
    name: string | null;
    birthdate: string | null;
    cpf: string | null;
    phone: string | null;
  };
  professional?: {
    id: string | null;
    name: string | null;
  };
  formData?: Record<string, string>;
}

const YES_NO_REGEX = /\(\s*\)\s*(Sim|sim)\s*\(\s*\)\s*(Não|nao|Nao)/i;
// Order matters: Sim/Não combo first, then a single empty parenthesis ( ).
const TOKEN_REGEX = /(\{[^}]+\}|\[TEXTO_LIVRE\]|\(\s*\)\s*(?:Sim|sim)\s*\(\s*\)\s*(?:Não|nao|Nao)|\(\s*\))/gi;
const SINGLE_CHECKBOX_REGEX = /^\(\s*\)$/;

/**
 * Convert a possibly-HTML document body to plain text preserving line breaks.
 * Tokenization and PDF export operate on plain text.
 */
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return '';
  // Detect HTML content; if it has no tags, return as-is
  if (!/<[a-z][\s\S]*?>/i.test(input)) return input;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // Naive fallback: strip tags and decode &nbsp;/&amp;/&lt;/&gt;
    return input
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  const doc = new DOMParser().parseFromString(input, 'text/html');
  // innerText would not be reliable on detached nodes; manually walk.
  const blockTags = new Set(['P', 'DIV', 'BR', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    const isBlock = blockTags.has(el.tagName);
    if (isBlock && out && !out.endsWith('\n')) out += '\n';
    el.childNodes.forEach(walk);
    if (isBlock && !out.endsWith('\n')) out += '\n';
  };
  doc.body.childNodes.forEach(walk);
  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function normalizeDocumentLinkPayload<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) {
    return (payload[0] as T | undefined) ?? null;
  }

  if (payload && typeof payload === 'object') {
    return payload as T;
  }

  return null;
}

export function extractDocumentPrefillSnapshot(payload: Record<string, unknown> | null | undefined): DocumentPrefillSnapshot {
  const raw = payload?.__prefill;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { formData: {} };
  }

  const snapshot = raw as Record<string, unknown>;
  const rawFormData = snapshot.formData;

  return {
    client: (snapshot.client && typeof snapshot.client === 'object' && !Array.isArray(snapshot.client)
      ? (snapshot.client as DocumentPrefillSnapshot['client'])
      : undefined),
    professional: (snapshot.professional && typeof snapshot.professional === 'object' && !Array.isArray(snapshot.professional)
      ? (snapshot.professional as DocumentPrefillSnapshot['professional'])
      : undefined),
    formData: rawFormData && typeof rawFormData === 'object' && !Array.isArray(rawFormData)
      ? Object.fromEntries(
          Object.entries(rawFormData as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')])
        )
      : {},
  };
}

export function isAutoFilledVariable(name: string): boolean {
  const normalized = name.toLowerCase();

  return [
    'cliente',
    'nome_cliente',
    'nome',
    'cpf',
    'idade',
    'idade_cliente',
    'data_nascimento',
    'nascimento',
    'telefone',
    'profissional',
    'professional',
    'nome_profissional',
    'data',
    'date',
    'data_atual',
    'hora',
    'hora_atual',
    'data_hora',
    'data_extenso',
    'data_extensa',
    'data_por_extenso',
    'data_extenso_completa',


export interface DocumentTokenCounters {
  freeTextIndex: number;
  checkboxIndex: number;
}

export function createTokenCounters(): DocumentTokenCounters {
  return { freeTextIndex: 0, checkboxIndex: 0 };
}

/**
 * Tokenize a fragment of a line. Used both by the plain-text tokenizer and by
 * the HTML-preserving filler (where a single visual line can be split across
 * several text nodes because of bold/color spans).
 */
export function tokenizeDocumentSegment(
  segment: string,
  lineIndex: number,
  counters: DocumentTokenCounters = createTokenCounters(),
): DocumentFieldToken[] {
  const parts = segment.split(TOKEN_REGEX).filter(part => part !== undefined && part !== '');
  if (parts.length === 0) {
    return [{ type: 'text', value: segment }];
  }

  const tokens: DocumentFieldToken[] = [];

  parts.forEach(part => {
    if (/^\{[^}]+\}$/.test(part)) {
      const name = part.slice(1, -1).trim();
      tokens.push({ type: 'variable', name, fieldKey: name });
      return;
    }

    if (part === '[TEXTO_LIVRE]') {
      const previousText = [...tokens].reverse().find(token => token.type === 'text') as { type: 'text'; value: string } | undefined;
      const label = previousText?.value.trim().replace(/:$/, '') || `Campo de texto ${lineIndex + 1}.${counters.freeTextIndex + 1}`;
      tokens.push({ type: 'freeText', fieldKey: `texto_livre_${lineIndex}_${counters.freeTextIndex}`, label });
      counters.freeTextIndex += 1;
      return;
    }

    if (YES_NO_REGEX.test(part)) {
      const previousText = [...tokens].reverse().find(token => token.type === 'text') as { type: 'text'; value: string } | undefined;
      const label = previousText?.value.trim().replace(/:$/, '') || `Pergunta ${lineIndex + 1}`;
      tokens.push({ type: 'yesno', fieldKey: `question_${lineIndex}`, label });
      return;
    }

    if (SINGLE_CHECKBOX_REGEX.test(part)) {
      // Use surrounding text as label (prefer next text, fallback to previous)
      const previousText = [...tokens].reverse().find(token => token.type === 'text') as { type: 'text'; value: string } | undefined;
      const label = previousText?.value.trim().replace(/[:•\-]$/, '').trim() || `Opção ${lineIndex + 1}.${counters.checkboxIndex + 1}`;
      tokens.push({ type: 'checkbox', fieldKey: `checkbox_${lineIndex}_${counters.checkboxIndex}`, label });
      counters.checkboxIndex += 1;
      return;
    }

    tokens.push({ type: 'text', value: part });
  });

  return tokens;
}

export function tokenizeDocumentLine(line: string, lineIndex: number): DocumentFieldToken[] {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return [{ type: 'text', value: '' }];
  }

  if (!line.match(TOKEN_REGEX) && (trimmedLine.includes('_____') || (trimmedLine.endsWith(':') && trimmedLine.length > 3))) {
    const label = trimmedLine.replace(/_+/g, '').replace(/:$/, '').trim();
    return [
      { type: 'text', value: label ? `${label}: ` : '' },
      { type: 'blankField', fieldKey: `field_${lineIndex}`, label: label || `Campo ${lineIndex + 1}` },
    ];
  }

  return tokenizeDocumentSegment(line, lineIndex, createTokenCounters());
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const WEEKDAYS_PT = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
];

const SAO_PAULO_TZ = 'America/Sao_Paulo';

function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const day = Number(get('day'));
  const month = Number(get('month'));
  const year = Number(get('year'));
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { day, month, year, hour, minute, weekdayIndex };
}

/** "12 de agosto de 2026" — always spelled out (never numeric). */
export function formatDocumentDateExtended(date: Date = new Date()): string {
  const { day, month, year } = saoPauloParts(date);
  return `${day} de ${MONTHS_PT[month - 1]} de ${year}`;
}

/** "quarta-feira, 12 de agosto de 2026" */
export function formatDocumentDateExtendedFull(date: Date = new Date()): string {
  const { weekdayIndex } = saoPauloParts(date);
  return `${WEEKDAYS_PT[weekdayIndex]}, ${formatDocumentDateExtended(date)}`;
}

/** "12/08/2026" */
export function formatDocumentDateNumeric(date: Date = new Date()): string {
  const { day, month, year } = saoPauloParts(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** "17:01" in America/Sao_Paulo */
export function formatDocumentTime(date: Date = new Date()): string {
  const { hour, minute } = saoPauloParts(date);
  return `${hour}:${minute}`;
}

/** "12/08/2026 às 17:01" */
export function formatDocumentDateTime(date: Date = new Date()): string {
  return `${formatDocumentDateNumeric(date)} às ${formatDocumentTime(date)}`;
}

/**
 * Single source of truth for date/time variables of a document.
 * Always built from ONE captured instant so the body of the document, its
 * description and the saved record never diverge.
 */
export function buildDocumentDateTimeValues(date: Date = new Date()): Record<string, string> {
  const numeric = formatDocumentDateNumeric(date);
  const extended = formatDocumentDateExtended(date);
  return {
    data: numeric,
    data_atual: numeric,
    date: numeric,
    data_extenso: extended,
    data_extensa: extended,
    data_por_extenso: extended,
    data_extenso_completa: formatDocumentDateExtendedFull(date),
    hora: formatDocumentTime(date),
    hora_atual: formatDocumentTime(date),
    data_hora: formatDocumentDateTime(date),
  };
}


interface BuildContentOptions {
  content: string;
  formData: Record<string, string>;
  yesNoAnswers: Record<string, 'sim' | 'nao' | ''>;
  additionalInfo: Record<string, string>;
  checkboxAnswers?: Record<string, boolean>;
}

export function buildFilledDocumentContent({
  content,
  formData,
  yesNoAnswers,
  additionalInfo,
  checkboxAnswers = {},
}: BuildContentOptions): string {
  return content
    .split('\n')
    .map((line, lineIndex) => {
      const tokens = tokenizeDocumentLine(line, lineIndex);

      return tokens
        .map(token => {
          switch (token.type) {
            case 'text':
              return token.value;
            case 'variable':
              return formData[token.fieldKey] || '';
            case 'yesno': {
              const answer = yesNoAnswers[token.fieldKey] || '';
              if (answer === 'sim') return '(X) Sim ( ) Não';
              if (answer === 'nao') return '( ) Sim (X) Não';
              return '( ) Sim ( ) Não';
            }
            case 'checkbox':
              return checkboxAnswers[token.fieldKey] ? '(X)' : '( )';
            case 'freeText':
            case 'blankField':
              return additionalInfo[token.fieldKey] || '';
            default:
              return '';
          }
        })
        .join('');
    })
    .join('\n');
}

