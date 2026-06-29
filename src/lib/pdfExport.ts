/**
 * Helper único e padronizado para gerar PDFs tabulares em todo o app.
 *
 * Garantias:
 *  - Margens iguais em todos os relatórios (14mm).
 *  - `overflow: 'linebreak'` em TODAS as células → texto longo quebra de
 *    linha em vez de sobrepor a coluna seguinte.
 *  - `valign: 'middle'` → linhas com células de tamanhos diferentes
 *    (texto quebrado) ficam visualmente alinhadas.
 *  - `tableWidth: 'auto'` respeitando margens.
 *  - Soma das `cellWidth` validada em dev: se passar da largura útil,
 *    avisa no console para corrigir, evitando colunas espremidas/sobrepostas.
 *  - Cabeçalho do documento (título + subtítulo) e rodapé com paginação
 *    e timestamp gerados automaticamente.
 *  - Remove acentos quando o helper `safeText` é usado, para evitar
 *    glifos faltantes em fontes built-in do jsPDF (helvetica).
 */

import jsPDF from 'jspdf';
import autoTable, { type RowInput, type Styles, type UserOptions } from 'jspdf-autotable';

export type PdfOrientation = 'portrait' | 'landscape';

export interface StandardPdfOptions {
  filename: string;
  title: string;
  subtitle?: string;
  orientation?: PdfOrientation;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /** Largura customizada por coluna (mm). Não preenchidas → distribuição automática. */
  columnWidths?: Record<number, number>;
  /** Alinhamento por coluna. */
  columnAlign?: Record<number, 'left' | 'center' | 'right'>;
  /** Resumo opcional a renderizar após a tabela (cada linha = uma linha de texto). */
  footerLines?: string[];
  /** Função opcional para gerar conteúdo extra antes da tabela. */
  beforeTable?: (doc: jsPDF, startY: number) => number;
}

const MARGIN = 14;
const HEADER_FILL: [number, number, number] = [41, 98, 255];

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return stripAccents(String(value));
}

/** Cria documento com cabeçalho padrão. Retorna o jsPDF + a posição Y livre. */
function createDoc(opts: { title: string; subtitle?: string; orientation: PdfOrientation }) {
  const doc = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(safeText(opts.title), MARGIN, 16);
  let y = 22;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(safeText(opts.subtitle), MARGIN, y);
    doc.setTextColor(0);
    y += 6;
  }
  return { doc, y: y + 4 };
}

function usableWidth(doc: jsPDF) {
  return doc.internal.pageSize.getWidth() - MARGIN * 2;
}

function buildColumnStyles(
  headersLength: number,
  widths?: Record<number, number>,
  aligns?: Record<number, 'left' | 'center' | 'right'>,
): Record<number, Partial<Styles>> {
  const styles: Record<number, Partial<Styles>> = {};
  for (let i = 0; i < headersLength; i++) {
    const w = widths?.[i];
    const a = aligns?.[i];
    if (w || a) styles[i] = { ...(w ? { cellWidth: w } : {}), ...(a ? { halign: a } : {}) };
  }
  return styles;
}

function attachPageFooter(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  const ts = new Date().toLocaleString('pt-BR');
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Gerado em ${ts}`, MARGIN, pageHeight - 6);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
    doc.setTextColor(0);
  }
}

/** Valida em dev se a soma das cellWidth cabe na página. */
function warnIfOverflow(doc: jsPDF, widths?: Record<number, number>) {
  if (!widths) return;
  const sum = Object.values(widths).reduce((a, b) => a + b, 0);
  const avail = usableWidth(doc);
  if (sum > avail + 0.5) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pdfExport] Soma das larguras de coluna (${sum.toFixed(1)}mm) excede a área útil (${avail.toFixed(1)}mm). Colunas podem se sobrepor.`,
    );
  }
}

/**
 * Exporta uma tabela padronizada para PDF e dispara o download.
 * Use sempre que possível em vez de chamar jsPDF/autoTable manualmente.
 */
export function exportTableToPdf(options: StandardPdfOptions): void {
  const orientation: PdfOrientation = options.orientation
    ?? (options.headers.length > 5 ? 'landscape' : 'portrait');

  const { doc, y: headerEndY } = createDoc({
    title: options.title,
    subtitle: options.subtitle,
    orientation,
  });

  warnIfOverflow(doc, options.columnWidths);

  let startY = headerEndY;
  if (options.beforeTable) startY = options.beforeTable(doc, startY) + 4;

  const body: RowInput[] = options.rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : safeText(cell))),
  );
  const head: RowInput[] = [options.headers.map((h) => safeText(h))];

  const tableOpts: UserOptions = {
    startY,
    head,
    body,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 'auto',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: HEADER_FILL,
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 3,
    },
    bodyStyles: { textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    columnStyles: buildColumnStyles(options.headers.length, options.columnWidths, options.columnAlign),
  };

  autoTable(doc, tableOpts);

  if (options.footerLines && options.footerLines.length) {
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    let y = finalY + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const line of options.footerLines) {
      doc.text(safeText(line), MARGIN, y);
      y += 6;
    }
  }

  attachPageFooter(doc);

  const stamp = new Date().toISOString().split('T')[0];
  doc.save(`${options.filename}_${stamp}.pdf`);
}
