import { useState, useEffect, useRef } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  FileDown, 
  FileSignature, 
  ExternalLink, 
  Printer, 
  User, 
  Save,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';

interface FillDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  preSelectedClientId?: string;
  onDocumentSaved?: () => void;
}

export function FillDocumentDialog({ 
  open, 
  onOpenChange, 
  template,
  preSelectedClientId,
  onDocumentSaved
}: FillDocumentDialogProps) {
  const { clients } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<string>(preSelectedClientId || '');
  const [filledContent, setFilledContent] = useState('');
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Extract variables from template
  const extractVariables = (content: string): string[] => {
    const regex = /\{([^}]+)\}/g;
    const matches = content.match(regex) || [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  };

  const variables = template?.content ? extractVariables(template.content) : [];

  // Auto-fill variables based on selected client
  useEffect(() => {
    if (!template?.content) return;

    let content = template.content;
    
    if (selectedClient) {
      content = content.replace(/\{nome\}/gi, selectedClient.name || '');
      content = content.replace(/\{email\}/gi, selectedClient.email || '');
      content = content.replace(/\{telefone\}/gi, selectedClient.phone || '');
      content = content.replace(/\{cpf\}/gi, selectedClient.cpf || '');
      content = content.replace(/\{nascimento\}/gi, selectedClient.birthdate ? format(new Date(selectedClient.birthdate), 'dd/MM/yyyy') : '');
    }

    content = content.replace(/\{data\}/gi, format(new Date(), 'dd/MM/yyyy', { locale: ptBR }));
    content = content.replace(/\{hora\}/gi, format(new Date(), 'HH:mm', { locale: ptBR }));
    content = content.replace(/\{data_extenso\}/gi, format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }));

    // Apply custom variables
    Object.entries(customVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      content = content.replace(regex, value);
    });

    setFilledContent(content);
  }, [template, selectedClient, customVariables]);

  useEffect(() => {
    if (preSelectedClientId) {
      setSelectedClientId(preSelectedClientId);
    }
  }, [preSelectedClientId]);

  const handleCustomVariableChange = (variable: string, value: string) => {
    setCustomVariables(prev => ({
      ...prev,
      [variable]: value
    }));
  };

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
          <title>${template.title}</title>
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
          <h1>${template.title}</h1>
          <div class="content">${filledContent.replace(/\n/g, '<br>')}</div>
          <div class="signature-area">
            <div class="signature-line">Assinatura do Cliente</div>
            <div class="signature-line">Assinatura do Responsável</div>
          </div>
          <div class="footer">
            Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleSaveToClient = async () => {
    if (!selectedClientId) {
      toast.error('Selecione um cliente');
      return;
    }

    setSaving(true);
    try {
      const docType = template.title.toLowerCase().includes('anamnese') ? 'anamnese' : 
                      template.title.toLowerCase().includes('contrato') ? 'contract' : 'other';

      const { error } = await supabase
        .from('client_documents')
        .insert({
          client_id: selectedClientId,
          template_id: template.id,
          title: template.title,
          description: `Preenchido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
          type: docType,
          content: filledContent,
          filled_variables: customVariables,
        });

      if (error) throw error;

      toast.success('Documento salvo no perfil do cliente!');
      onDocumentSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Erro ao salvar documento');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenGovBr = () => {
    window.open('https://assinador.iti.br/', '_blank');
  };

  const unfilledVariables = variables.filter(v => {
    const lowerV = v.toLowerCase();
    const autoFilled = ['nome', 'email', 'telefone', 'cpf', 'nascimento', 'data', 'hora', 'data_extenso'];
    if (autoFilled.includes(lowerV)) return false;
    return !customVariables[v];
  });

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Preencher Documento: {template.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Variables */}
          <div className="w-[320px] border-r p-4 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  Cliente *
                </Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="h-9 mt-1.5">
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClient && (
                <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1">
                  <p><strong>Nome:</strong> {selectedClient.name}</p>
                  <p><strong>Telefone:</strong> {selectedClient.phone}</p>
                  {selectedClient.email && <p><strong>Email:</strong> {selectedClient.email}</p>}
                  {selectedClient.cpf && <p><strong>CPF:</strong> {selectedClient.cpf}</p>}
                </div>
              )}

              <Separator />

              <div>
                <Label className="text-sm font-medium">Variáveis do Documento</Label>
                <div className="flex flex-wrap gap-1 mt-2">
                  {variables.map((v, i) => (
                    <Badge 
                      key={i} 
                      variant={unfilledVariables.includes(v) ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {'{' + v + '}'}
                    </Badge>
                  ))}
                </div>
              </div>

              {unfilledVariables.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Preencher Campos</Label>
                    {unfilledVariables.map(v => (
                      <div key={v}>
                        <Label className="text-xs text-muted-foreground">{v}</Label>
                        <Input
                          value={customVariables[v] || ''}
                          onChange={(e) => handleCustomVariableChange(v, e.target.value)}
                          placeholder={`Digite ${v}...`}
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Content Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <span className="text-sm font-medium">Pré-visualização</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowPreview(!showPreview)}
                className="h-7 text-xs"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                {showPreview ? 'Editar' : 'Apenas Visualizar'}
              </Button>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {showPreview ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <pre className="whitespace-pre-wrap font-sans text-sm bg-white dark:bg-gray-900 rounded-lg p-4 border shadow-sm">
                    {filledContent}
                  </pre>
                </div>
              ) : (
                <Textarea
                  value={filledContent}
                  onChange={(e) => setFilledContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm resize-none"
                  placeholder="Conteúdo do documento..."
                />
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4 bg-muted/20">
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenGovBr}>
                <FileSignature className="h-4 w-4 mr-1.5" />
                Assinar Gov.br
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <Button 
              size="sm" 
              onClick={handleSaveToClient}
              disabled={saving || !selectedClientId}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Salvando...' : 'Salvar no Cliente'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
