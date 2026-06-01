import { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Printer, 
  Download,
  FileSignature, 
  ExternalLink, 
  Trash2,
  FileText,
  Send,
  Mail,
  MessageCircle,
  Loader2,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';
import { downloadBlob, getFileNameWithExtension, getStorageBlob } from '@/lib/storageFileAccess';

interface ClientDocumentViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: any;
  client?: { name: string; phone: string; email?: string };
  onDelete?: (id: string) => void;
}

const documentTypeLabels: Record<string, string> = {
  anamnese: 'Anamnese',
  contract: 'Contrato',
  quote: 'Orçamento',
  photo: 'Foto',
  other: 'Outro',
};

const documentTypeColors: Record<string, string> = {
  anamnese: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  contract: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  quote: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  photo: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

export function ClientDocumentViewDialog({ 
  open, 
  onOpenChange, 
  document,
  client,
  onDelete
}: ClientDocumentViewDialogProps) {
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const getMimeFromName = (name: string): string => {
      const ext = name.toLowerCase().split('?')[0].split('.').pop() || '';
      const map: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        svg: 'image/svg+xml',
      };
      return map[ext] || '';
    };

    const loadFileBlob = async () => {
      setFileObjectUrl(null);
      setFilePreviewUrl(null);
      setFileMimeType(null);
      if (!open || (!document?.file_path && !document?.file_url)) {
        setFilePreviewUrl(document?.file_url || null);
        return;
      }

      setIsLoadingFile(true);
      try {
        const rawBlob = await getStorageBlob({
          bucket: 'client-documents',
          filePath: document.file_path,
          fileUrl: document.file_url,
        });

        // Force the correct MIME type so Edge/Chrome don't block the inline preview
        const fallbackMime = getMimeFromName(String(document.file_path || document.file_url || ''));
        const effectiveType = rawBlob.type && rawBlob.type !== 'application/octet-stream'
          ? rawBlob.type
          : fallbackMime;
        const blob = effectiveType && effectiveType !== rawBlob.type
          ? new Blob([rawBlob], { type: effectiveType })
          : rawBlob;

        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setFileObjectUrl(objectUrl);
          setFilePreviewUrl(objectUrl);
          setFileMimeType(effectiveType || blob.type || null);
        }
      } catch (error) {
        console.error('Error loading document file:', error);
        if (!cancelled) {
          setFilePreviewUrl(null);
          toast.error('Sem permissão para visualizar este documento.');
        }
      } finally {
        if (!cancelled) setIsLoadingFile(false);
      }
    };

    loadFileBlob();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, document?.file_path, document?.file_url]);

  if (!document) return null;

  const fileName = String(document.file_path || document.file_url || document.title || '').toLowerCase();
  const previewSrc = fileObjectUrl || filePreviewUrl;
  const isPdfFile = !!previewSrc && (/\.pdf(\?|$)/i.test(fileName) || fileMimeType === 'application/pdf');
  const isImageFile = !!previewSrc && (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(fileName) || !!fileMimeType?.startsWith('image/'));
  const canInlinePreviewFile = isPdfFile || isImageFile;

  const handleDownloadPdf = () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 22;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const normalizePdfText = (value: string) => value.replace(/\r\n/g, '\n').replace(/\t/g, '  ');
    const addFooter = () => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`Página ${pdf.getNumberOfPages()}`, pageWidth / 2, pageHeight - 12, { align: 'center' });
    };
    let y = 24;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(normalizePdfText(document.title || 'Documento'), pageWidth / 2, y, { align: 'center', maxWidth });
    y += 9;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(normalizePdfText(`Cliente: ${client?.name || 'Não informado'}`), margin, y);
    y += 5;
    pdf.text(normalizePdfText(`Gerado em ${format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), margin, y);
    if (document.signed_at) {
      y += 5;
      pdf.text(normalizePdfText(`Assinado em ${format(new Date(document.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}${document.signed_by ? ` por ${document.signed_by}` : ''}`), margin, y);
    }
    y += 8;
    pdf.setDrawColor(180);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    const lines = pdf.splitTextToSize(normalizePdfText(document.content || ''), maxWidth);
    pdf.setFontSize(10);
    lines.forEach((line: string) => {
      if (y > pageHeight - 24) {
        addFooter();
        pdf.addPage();
        y = 22;
      }
      pdf.text(line, margin, y);
      y += 5;
    });
    addFooter();

    const fileName = `${document.title} - ${client?.name || 'cliente'}.pdf`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ._-]/g, '');
    pdf.save(fileName);
  };

  const handleOpenGovBr = () => {
    window.open('https://assinador.iti.br/', '_blank');
  };

  const handleDownloadFile = async () => {
    try {
      const blob = await getStorageBlob({
        bucket: 'client-documents',
        filePath: document.file_path,
        fileUrl: document.file_url,
      });
      downloadBlob(blob, getFileNameWithExtension(document.title || 'documento', document.file_path || document.file_url));
    } catch (error) {
      console.error('Error downloading document file:', error);
      toast.error('Sem permissão para baixar este documento.');
    }
  };

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja excluir este documento?')) {
      onDelete?.(document.id);
      onOpenChange(false);
    }
  };

  const handleSendWhatsApp = async () => {
    const phone = phoneInput || client?.phone;
    if (!phone) {
      toast.error('Informe o número de telefone do cliente');
      return;
    }

    if (!document.content) {
      toast.error('Documento sem conteúdo para enviar');
      return;
    }

    setIsSendingWhatsapp(true);
    try {
      // Prepare document message
      const signedStatus = document.signed_at 
        ? `✅ Assinado em ${format(new Date(document.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
        : '⚠️ Aguardando assinatura';
      
      const message = `📄 *${document.title}*
${documentTypeLabels[document.type] || 'Documento'}

${signedStatus}

---
${document.content.substring(0, 3000)}${document.content.length > 3000 ? '\n\n... (documento truncado)' : ''}
---

Documento gerado em ${format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;

      const opened = openWhatsappWithMessage(phone, message);
      if (opened) {
        setWhatsappSent(true);
        toast.success('WhatsApp aberto com a mensagem pronta para envio');
        setTimeout(() => setWhatsappSent(false), 3000);
      } else {
        toast.error('Não foi possível abrir o WhatsApp. Verifique o bloqueador de pop-ups.');
      }
    } catch (error: any) {
      console.error('Error opening WhatsApp:', error);
      toast.error('Erro ao abrir WhatsApp');
    } finally {
      setIsSendingWhatsapp(false);
    }
  };

  const handleSendEmail = async () => {
    const email = emailInput || client?.email;
    if (!email) {
      toast.error('Informe o e-mail do cliente');
      return;
    }

    if (!document.content) {
      toast.error('Documento sem conteúdo para enviar');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('E-mail inválido');
      return;
    }

    setIsSendingEmail(true);
    try {
      // For now, open mailto with the document content
      // A proper implementation would use Resend API via edge function
      const subject = encodeURIComponent(`Documento: ${document.title}`);
      const signedStatus = document.signed_at 
        ? `Assinado em ${format(new Date(document.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
        : 'Aguardando assinatura';
      
      const body = encodeURIComponent(`${document.title}
${documentTypeLabels[document.type] || 'Documento'}

Status: ${signedStatus}

---
${document.content}
---

Documento gerado em ${format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`);

      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
      
      setEmailSent(true);
      toast.success('E-mail aberto no seu cliente de e-mail');
      setTimeout(() => setEmailSent(false), 3000);
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error('Erro ao preparar e-mail');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] w-[96vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <DialogTitle className="text-lg">{document.title}</DialogTitle>
                <Badge 
                  className={`${documentTypeColors[document.type] || documentTypeColors.other} text-xs`}
                  variant="secondary"
                >
                  {documentTypeLabels[document.type] || 'Documento'}
                </Badge>
              </div>
              {document.description && (
                <p className="text-sm text-muted-foreground mt-1">{document.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Criado em {format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              {document.signed_at && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ Assinado em {format(new Date(document.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {document.signed_by && ` por ${document.signed_by}`}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 py-4" style={{ maxHeight: 'calc(85vh - 220px)' }}>
          {document.content ? (
            <div className="mx-auto w-full max-w-[620px] rounded-sm border bg-background p-6 shadow-sm">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
                {document.content}
              </pre>
            </div>
          ) : document.file_path || document.file_url ? (
            <div className="mx-auto w-full max-w-[720px] rounded-sm border bg-background p-3 shadow-sm">
              {isLoadingFile ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : canInlinePreviewFile ? (
                isImageFile ? (
                  <img
                    src={previewSrc || ''}
                    alt={document.title || 'Documento'}
                    loading="lazy"
                    className="block mx-auto h-auto w-auto max-w-full"
                  />
                ) : (
                  <object
                    data={previewSrc || ''}
                    type="application/pdf"
                    className="h-[78vh] min-h-[520px] w-full rounded-sm border-0"
                    aria-label={document.title || 'Documento'}
                  >
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">
                        Seu navegador bloqueou a visualização inline deste PDF.
                      </p>
                      <Button onClick={handleDownloadFile}>
                        <Download className="h-4 w-4 mr-2" />
                        Baixar arquivo
                      </Button>
                    </div>
                  </object>
                )
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Pré-visualização indisponível para este tipo de arquivo.
                  </p>
                  <Button onClick={handleDownloadFile}>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar arquivo
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Documento sem conteúdo disponível.
              </p>
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              {document.content && (
                <>
                  <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Baixar PDF
                  </Button>
                  
                  {/* WhatsApp Send Button */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20">
                        <MessageCircle className="h-4 w-4 mr-1.5" />
                        WhatsApp
                        {whatsappSent && <Check className="h-3 w-3 ml-1" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="start">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Telefone do cliente</Label>
                          <Input
                            placeholder={client?.phone || "(00) 00000-0000"}
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            className="h-8 text-sm"
                          />
                          {client?.phone && !phoneInput && (
                            <p className="text-xs text-muted-foreground">
                              Padrão: {client.phone}
                            </p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={handleSendWhatsApp}
                          disabled={isSendingWhatsapp || whatsappLoading}
                        >
                          {isSendingWhatsapp || whatsappLoading ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-1.5" />
                          )}
                          Enviar por WhatsApp
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Email Send Button */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20">
                        <Mail className="h-4 w-4 mr-1.5" />
                        E-mail
                        {emailSent && <Check className="h-3 w-3 ml-1" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="start">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">E-mail do cliente</Label>
                          <Input
                            type="email"
                            placeholder={client?.email || "email@exemplo.com"}
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            className="h-8 text-sm"
                          />
                          {client?.email && !emailInput && (
                            <p className="text-xs text-muted-foreground">
                              Padrão: {client.email}
                            </p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={handleSendEmail}
                          disabled={isSendingEmail}
                        >
                          {isSendingEmail ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-1.5" />
                          )}
                          Enviar por E-mail
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}
              {(document.file_path || document.file_url) && (
                <Button variant="outline" size="sm" onClick={handleDownloadFile}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Baixar Arquivo
                </Button>
              )}
              
              <Button variant="outline" size="sm" onClick={handleOpenGovBr}>
                <FileSignature className="h-4 w-4 mr-1.5" />
                Assinar Gov.br
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            
            {onDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}