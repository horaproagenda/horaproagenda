import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PdfHeaderInfo {
  name?: string | null;
  cpf?: string | null;
  birthdate?: string | null;
  professionalName?: string | null;
}

const removeAccents = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Generate a printable PDF (A4) for a filled client document.
 * Used by both /preencher-documento and /cadastro-cliente flows.
 */
export function generateClientDocumentPdf(opts: {
  title: string;
  filledContent: string;
  header?: PdfHeaderInfo;
  fileName?: string;
}) {
  const { title, filledContent, header } = opts;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(removeAccents(title), pageWidth / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    removeAccents(`Data de preenchimento: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`),
    margin,
    y,
  );
  y += 6;

  if (header?.name) {
    doc.text(removeAccents(`Cliente: ${header.name}`), margin, y);
    y += 5;
  }
  if (header?.cpf) {
    doc.text(removeAccents(`CPF: ${header.cpf}`), margin, y);
    y += 5;
  }
  if (header?.birthdate) {
    doc.text(removeAccents(`Nascimento: ${header.birthdate}`), margin, y);
    y += 5;
  }
  if (header?.professionalName) {
    doc.text(removeAccents(`Profissional: ${header.professionalName}`), margin, y);
    y += 5;
  }
  y += 4;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(11);
  const lines = doc.splitTextToSize(removeAccents(filledContent), maxWidth);
  for (const line of lines) {
    if (y > pageHeight - 35) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin, y);
    y += 6;
  }

  y += 14;
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 40;
  }
  doc.line(margin, y, pageWidth / 2 + 20, y);
  y += 5;
  doc.setFontSize(9);
  doc.text(removeAccents('Assinatura'), margin, y);
  y += 8;
  doc.text(removeAccents('Data: ____/____/________'), margin, y);

  const fileName = opts.fileName || `${title} - ${header?.name || 'Documento'}.pdf`;
  doc.save(removeAccents(fileName));
}
