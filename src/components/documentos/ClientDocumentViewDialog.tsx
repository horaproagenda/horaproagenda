import { useState } from 'react';
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
import { useWhatsapp } from '@/hooks/useWhatsapp';

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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  
  const { sendMessage, isLoading: whatsappLoading } = useWhatsapp();

  if (!document) return null;

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

      const success = await sendMessage(phone, message);
      
      if (success) {
        setWhatsappSent(true);
        setTimeout(() => setWhatsappSent(false), 3000);
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp:', error);
      toast.error('Erro ao enviar por WhatsApp');
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
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0">
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

        <ScrollArea className="flex-1 h-[62vh] px-6 py-4">
          {document.content ? (
            <div className="mx-auto w-full max-w-[620px] min-h-[780px] rounded-sm border bg-background p-6 shadow-sm">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
                {document.content}
              </pre>
            </div>
          ) : document.file_url ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Este documento é um arquivo externo.
              </p>
              <Button asChild>
                <a href={document.file_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir Arquivo
                </a>
              </Button>
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