import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Printer, 
  FileSignature, 
  ExternalLink, 
  Trash2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface ClientDocumentViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: any;
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
  onDelete
}: ClientDocumentViewDialogProps) {
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
            <div className="flex gap-2">
              {document.content && (
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-1.5" />
                  Imprimir / PDF
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
