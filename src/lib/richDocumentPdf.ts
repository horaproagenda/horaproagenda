import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { sanitizeRichDocumentHtml } from './documentRichContent';

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
  const { title, bodyHtml, headerLines = [], signatureImage, signatureLabel } = opts;

  const container = window.document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px'; // ~A4 width at 96dpi
  container.style.padding = '48px 56px';
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
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    let remaining = imgHeight;
    let offset = 0;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    while (remaining > 0) {
      pdf.addImage(imgData, 'JPEG', 0, -offset, pageWidth, imgHeight, undefined, 'FAST');
      remaining -= pageHeight;
      offset += pageHeight;
      if (remaining > 0) pdf.addPage();
    }

    pdf.save(`${sanitizeFileName(opts.fileName || title)}.pdf`);
  } finally {
    container.remove();
  }
}
