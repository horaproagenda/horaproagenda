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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Bloqueador de pop-up ativo. Permita pop-ups para imprimir.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${document.title}</title>
          <style>
            @page { margin: 2cm; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              line-height: 1.6; 
              color: #333;
              padding: 20px;
            }
            h1 { 
              font-size: 18px; 
              margin-bottom: 20px;
              text-align: center;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .content { 
              white-space: pre-wrap; 
              font-size: 12px;
            }
            .footer {
              margin-top: 40px;
              border-top: 1px solid #ccc;
              padding-top: 10px;
              font-size: 10px;
              color: #666;
            }
            .signature-area {
              margin-top: 60px;
              display: flex;
              justify-content: space-around;
            }
            .signature-line {
              width: 200px;
              border-top: 1px solid #333;
              text-align: center;
              padding-top: 5px;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <h1>${document.title}</h1>
          <div class="content">${(document.content || '').replace(/\n/g, '<br>')}</div>
          <div class="signature-area">
            <div class="signature-line">Assinatura do Cliente</div>
            <div class="signature-line">Assinatura do Responsável</div>
          </div>
          <div class="footer">
            Documento gerado em ${format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
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

        <ScrollArea className="flex-1 px-6 py-4">
          {document.content ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/30 rounded-lg p-4 border">
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
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Imprimir / PDF
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