export type DocumentFieldToken =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string; fieldKey: string }
  | { type: 'yesno'; fieldKey: string; label: string }
  | { type: 'freeText'; fieldKey: string; label: string }
  | { type: 'blankField'; fieldKey: string; label: string };

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
const TOKEN_REGEX = /(\{[^}]+\}|\[TEXTO_LIVRE\]|\(\s*\)\s*(?:Sim|sim)\s*\(\s*\)\s*(?:Não|nao|Nao))/gi;

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
    'data_extenso',
  ].includes(normalized);
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

  const parts = line.split(TOKEN_REGEX).filter(part => part !== '');
  if (parts.length === 0) {
    return [{ type: 'text', value: line }];
  }

  const tokens: DocumentFieldToken[] = [];
  let freeTextIndex = 0;

  parts.forEach(part => {
    if (/^\{[^}]+\}$/.test(part)) {
      const name = part.slice(1, -1).trim();
      tokens.push({ type: 'variable', name, fieldKey: name });
      return;
    }

    if (part === '[TEXTO_LIVRE]') {
      const previousText = [...tokens].reverse().find(token => token.type === 'text') as { type: 'text'; value: string } | undefined;
      const label = previousText?.value.trim().replace(/:$/, '') || `Campo de texto ${lineIndex + 1}.${freeTextIndex + 1}`;
      tokens.push({ type: 'freeText', fieldKey: `texto_livre_${lineIndex}_${freeTextIndex}`, label });
      freeTextIndex += 1;
      return;
    }

    if (YES_NO_REGEX.test(part)) {
      const previousText = [...tokens].reverse().find(token => token.type === 'text') as { type: 'text'; value: string } | undefined;
      const label = previousText?.value.trim().replace(/:$/, '') || `Pergunta ${lineIndex + 1}`;
      tokens.push({ type: 'yesno', fieldKey: `question_${lineIndex}`, label });
      return;
    }

    tokens.push({ type: 'text', value: part });
  });

  return tokens;
}

interface BuildContentOptions {
  content: string;
  formData: Record<string, string>;
  yesNoAnswers: Record<string, 'sim' | 'nao' | ''>;
  additionalInfo: Record<string, string>;
}

export function buildFilledDocumentContent({
  content,
  formData,
  yesNoAnswers,
  additionalInfo,
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
