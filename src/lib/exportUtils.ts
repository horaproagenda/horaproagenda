import { toast } from 'sonner';

/**
 * CSV helpers — pensados para Excel BR/PT (separador `;`).
 *
 * - Exporta com `;` para que o Excel em pt-BR abra cada coluna na célula
 *   certa sem precisar de "Texto para colunas".
 * - Faz quoting de valores que contêm separador, aspas ou quebra de linha.
 * - Adiciona BOM UTF-8 para que acentos não fiquem corrompidos.
 * - Usa `\r\n` para compatibilidade total com Windows / Excel.
 * - Fornece um parser CSV que respeita aspas (RFC 4180), evitando que
 *   `"Av. Brasil, 100"` vire duas colunas na importação.
 */

const CSV_SEPARATOR = ';';

interface ExportOptions {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  successMessage?: string;
  /** Sobrescreve o separador padrão (use com cuidado — quebra round-trip). */
  separator?: string;
}

interface TemplateOptions {
  filename: string;
  headers: string[];
  sampleRows?: (string | number)[][];
}

let lastExport: {
  filename: string;
  blob: Blob;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;

/** Aplica regra de quoting RFC-4180 ao valor. */
export function escapeCsvCell(value: unknown, separator: string = CSV_SEPARATOR): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str === '') return '';
  const mustQuote =
    str.includes(separator) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r') ||
    // Sempre quote se começar com espaço, para preservar formatação
    /^\s|\s$/.test(str);
  if (!mustQuote) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/** Gera o conteúdo CSV (sem BOM) a partir de headers + linhas. */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  separator: string = CSV_SEPARATOR,
): string {
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCsvCell(h, separator)).join(separator));
  for (const row of rows) {
    lines.push(row.map((c) => escapeCsvCell(c, separator)).join(separator));
  }
  return lines.join('\r\n');
}

/**
 * Parser CSV robusto. Respeita aspas, escapes (`""`), separadores e
 * quebras de linha dentro de campos. Retorna `string[][]`.
 *
 * Detecta automaticamente o separador (`;`, `,` ou `\t`) examinando a
 * primeira linha quando `separator` não é passado.
 */
export function parseCsv(text: string, separator?: string): string[][] {
  if (!text) return [];
  // Remove BOM
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = separator ?? detectSeparator(clean);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = clean.length;

  while (i < len) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // Normaliza \r\n e \r
      i++;
      if (clean[i] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\n') {
      i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
    i++;
  }
  // Última célula / última linha (se houver conteúdo)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Remove linhas totalmente em branco
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** Tenta detectar o separador a partir da primeira linha. */
export function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  // Conta ignorando o que está dentro de aspas
  const count = (sep: string) => {
    let n = 0;
    let inQ = false;
    for (const c of firstLine) {
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === sep) n++;
    }
    return n;
  };
  const candidates: Array<[string, number]> = [
    [';', count(';')],
    [',', count(',')],
    ['\t', count('\t')],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : CSV_SEPARATOR;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Pequeno delay antes do revoke para alguns browsers iOS
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToCSV({
  filename,
  headers,
  rows,
  successMessage = 'Dados exportados com sucesso!',
  separator = CSV_SEPARATOR,
}: ExportOptions) {
  const csv = buildCsv(headers, rows, separator);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const dated = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  triggerDownload(blob, dated);

  if (lastExport?.timeout) clearTimeout(lastExport.timeout);
  lastExport = {
    filename: dated,
    blob,
    timeout: setTimeout(() => {
      lastExport = null;
    }, 10000),
  };

  toast.success(successMessage, {
    action: {
      label: 'Exportar novamente',
      onClick: () => triggerDownload(blob, dated),
    },
    duration: 5000,
  });
}

/**
 * Baixa um arquivo de modelo CSV pronto para o usuário preencher
 * (mesmas colunas que o importador espera). Garante que o round-trip
 * exportar → reabrir → importar funcione sem dor de cabeça.
 */
export function downloadCsvTemplate({ filename, headers, sampleRows = [] }: TemplateOptions) {
  const csv = buildCsv(headers, sampleRows);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
  toast.success('Modelo CSV baixado. Preencha e importe de volta.');
}
