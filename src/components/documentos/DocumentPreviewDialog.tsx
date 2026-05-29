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
import { Edit2, Download, ExternalLink, FileSignature } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sanitizeHtmlContent } from '@/lib/htmlSanitizer';

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  onEdit: () => void;
}

export function DocumentPreviewDialog({ 
  open, 
  onOpenChange, 
  template,
  onEdit 
}: DocumentPreviewDialogProps) {
  if (!template) return null;

  const handleDownloadPDF = () => {
    // Create a simple text file for now - in production would use a PDF library
    const content = template.content;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenGovBr = () => {
    window.open('https://assinador.iti.br/', '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] w-[96vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-lg">{template.title}</DialogTitle>
              {template.description && (
                <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {template.variables?.map((v: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {'{' + v + '}'}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          <div className="prose prose-sm max-w-none dark:prose-invert pr-2">
            {/<[a-z][\s\S]*?>/i.test(template.content || '') ? (
              <div
                className="bg-muted/30 rounded-lg p-4 border whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: template.content }}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm bg-muted/30 rounded-lg p-4 border">
                {template.content}
              </pre>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <p className="text-[10px] text-muted-foreground mb-3">
            Atualizado em {format(new Date(template.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                <Download className="h-4 w-4 mr-1.5" />
                Exportar
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenGovBr}>
                <FileSignature className="h-4 w-4 mr-1.5" />
                Assinar Gov.br
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <Button size="sm" onClick={onEdit}>
              <Edit2 className="h-4 w-4 mr-1.5" />
              Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
