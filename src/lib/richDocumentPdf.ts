import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { sanitizeRichDocumentHtml } from './documentRichContent';
import { computePageSlices } from './pdfPageBreak';

/** Margem padrão (mm) aplicada no topo e no rodapé de TODAS as folhas. */
export const DOC_PAGE_MARGIN_MM = 15;

function makeBlankRowChecker(canvas: HTMLCanvasElement): (row: number) => boolean {
  let data: Uint8ClampedArray | null = null;
  try {
    const ctx = canvas.getContext?.('2d');
    data = ctx?.getImageData?.(0, 0, canvas.width, canvas.height)?.data ?? null;
  } catch { data = null; }
  if (!data) return () => true;
  const w = canvas.width;
  const d = data;
  return (row: number) => {
    const base = row * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i = base + x * 4;
      if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) return false;
    }
    return true;
  };
}

/** Adiciona o canvas ao PDF em folhas A4 enquadradas, sem cortar linhas. */
function addCanvasPages(pdf: jsPDF, canvas: HTMLCanvasElement, startOnNewPage: boolean): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pxPerMm = canvas.width / pageWidth;
  const contentPx = Math.floor((pageHeight - DOC_PAGE_MARGIN_MM * 2) * pxPerMm);
  const slices = computePageSlices(canvas.height, contentPx, makeBlankRowChecker(canvas));
  let first = !startOnNewPage;
  for (const { start, height } of slices) {
    const slice = window.document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = height;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height);
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, DOC_PAGE_MARGIN_MM, pageWidth, height / pxPerMm, undefined, 'FAST');
  }
}

interface RichPdfOptions {
  title: string;
  bodyHtml: string;
  headerLines?: string[];
  signatureImage?: string | null;
  signatureLabel?: string | null;
  fileName?: string;
}

const sanitizeFileName = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ._-]/g, '').trim() || 'documento';

/**
 * Renders a rich (HTML) document to an A4 PDF preserving bold, colors,
 * alignment, tables and embedded images.
 */
export async function downloadRichDocumentPdf(opts: RichPdfOptions): Promise<void> {
  const pdf = await buildRichDocumentPdf(opts);
  pdf.save(`${sanitizeFileName(opts.fileName || opts.title)}.pdf`);
}

/** Mesmo render visual, devolvendo os bytes do PDF (para juntar a outros PDFs). */
export async function renderRichDocumentPdfBytes(opts: RichPdfOptions): Promise<ArrayBuffer> {
  const pdf = await buildRichDocumentPdf(opts);
  return pdf.output('arraybuffer');
}

async function buildRichDocumentPdf(opts: RichPdfOptions): Promise<jsPDF> {
  const { title, bodyHtml, headerLines = [], signatureImage, signatureLabel } = opts;

  const container = window.document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px'; // ~A4 width at 96dpi
  container.style.padding = '8px 56px';
  container.style.background = '#ffffff';
  container.style.color = '#1f2937';
  container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
  container.style.fontSize = '13px';
  container.style.lineHeight = '1.6';

  const header = headerLines
    .filter(Boolean)
    .map(line => `<p style="margin:2px 0;font-size:11px;color:#4b5563;">${line}</p>`)
    .join('');

  const signature = signatureImage
    ? `<div style="margin-top:32px;padding-top:12px;border-top:1px solid #d1d5db;">
         <p style="font-size:11px;color:#6b7280;margin:0 0 6px;">Assinatura digital</p>
         <img src="${signatureImage}" alt="Assinatura" style="max-width:240px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;" />
         ${signatureLabel ? `<p style="font-size:11px;color:#6b7280;margin:6px 0 0;">${signatureLabel}</p>` : ''}
       </div>`
    : '';

  container.innerHTML = `
    <h1 style="font-size:19px;text-align:center;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #374151;">${title}</h1>
    ${header}
    <div class="rich-doc-body" style="margin-top:16px;">${sanitizeRichDocumentHtml(bodyHtml)}</div>
    ${signature}
  `;
  container.querySelectorAll('img').forEach(img => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  });
  container.querySelectorAll('table').forEach(table => {
    (table as HTMLTableElement).style.borderCollapse = 'collapse';
    (table as HTMLTableElement).style.maxWidth = '100%';
  });
  container.querySelectorAll('td, th').forEach(cell => {
    (cell as HTMLElement).style.border = (cell as HTMLElement).style.border || '1px solid #d1d5db';
    (cell as HTMLElement).style.padding = (cell as HTMLElement).style.padding || '4px 6px';
  });

  window.document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCanvasPages(pdf, canvas, false);

    return pdf;
  } finally {
    container.remove();
  }
}

/**
 * Gera UM único PDF com vários documentos (cada um começando em folha nova).
 * Navegadores bloqueiam downloads múltiplos automáticos, então "baixar todos"
 * precisa entregar um só arquivo.
 */
export async function downloadCombinedRichDocumentsPdf(opts: {
  documents: Array<{ title: string; bodyHtml: string }>;
  headerLines?: string[];
  fileName: string;
}): Promise<void> {
  const { documents, headerLines = [] } = opts;
  if (documents.length === 0) return;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let firstPage = true;

  for (const d of documents) {
    const container = window.document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    Object.assign(container.style, {
      position: 'fixed', left: '-10000px', top: '0', width: '794px', padding: '8px 56px',
      background: '#ffffff', color: '#1f2937', fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: '13px', lineHeight: '1.6',
    });
    const header = headerLines.filter(Boolean)
      .map(l => `<p style="margin:2px 0;font-size:11px;color:#4b5563;">${l}</p>`).join('');
    container.innerHTML = `
      <h1 style="font-size:19px;text-align:center;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #374151;">${d.title}</h1>
      ${header}
      <div class="rich-doc-body" style="margin-top:16px;">${sanitizeRichDocumentHtml(d.bodyHtml)}</div>`;
    container.querySelectorAll('img').forEach(img => { img.style.maxWidth = '100%'; img.style.height = 'auto'; });
    window.document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      addCanvasPages(pdf, canvas, !firstPage);
      firstPage = false;
    } finally {
      container.remove();
    }
  }
  pdf.save(`${sanitizeFileName(opts.fileName)}.pdf`);
}
