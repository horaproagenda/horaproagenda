import { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { escapeHtml, sanitizeDocumentContent } from '@/lib/htmlSanitizer';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  FileSignature, 
  ExternalLink, 
  Printer, 
  User, 
  Save,
  Eye,
  Edit3,
  PenTool
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { SignaturePad } from './SignaturePad';

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
  const [activeTab, setActiveTab] = useState<string>('content');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');

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
      content = content.replace(/\{nome_cliente\}/gi, selectedClient.name || '');
      content = content.replace(/\{email\}/gi, selectedClient.email || '');
      content = content.replace(/\{telefone\}/gi, selectedClient.phone || '');
      content = content.replace(/\{cpf\}/gi, selectedClient.cpf || '');
      content = content.replace(/\{nascimento\}/gi, selectedClient.birthdate ? format(new Date(selectedClient.birthdate), 'dd/MM/yyyy') : '');
      
      // Auto-fill professional from assigned_professional
      const professionalName = (selectedClient as any).assigned_professional?.name || '';
      content = content.replace(/\{profissional\}/gi, professionalName);
      
      // Calculate age from birthdate
      if (selectedClient.birthdate) {
        const birth = new Date(selectedClient.birthdate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        content = content.replace(/\{idade\}/gi, String(age));
      }
      
      setSignedBy(selectedClient.name);
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

  useEffect(() => {
    if (!open) {
      setSignatureData(null);
      setActiveTab('content');
    }
  }, [open]);

  const handleCustomVariableChange = (variable: string, value: string) => {
    setCustomVariables(prev => ({
      ...prev,
      [variable]: value
    }));
  };

  const handlePrint = (includeSignature: boolean = false) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Bloqueador de pop-up ativo. Permita pop-ups para imprimir.');
      return;
    }

    const signatureHtml = signatureData && includeSignature ? `
      <div class="signature-image">
        <p style="margin-bottom: 5px; font-size: 11px;">Assinatura Digital:</p>
        <img src="${signatureData}" alt="Assinatura" style="max-width: 250px; border: 1px solid #ccc; border-radius: 4px;" />
        <p style="font-size: 10px; color: #666; margin-top: 5px;">Assinado por: ${escapeHtml(signedBy)}</p>
        <p style="font-size: 10px; color: #666;">Data: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
      </div>
    ` : `
      <div class="signature-area">
        <div class="signature-line">Assinatura do Cliente</div>
        <div class="signature-line">Assinatura do Responsável</div>
      </div>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(template.title)}</title>
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
            .signature-image {
              margin-top: 40px;
              padding: 15px;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              background: #f9fafb;
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(template.title)}</h1>
          <div class="content">${sanitizeDocumentContent(filledContent)}</div>
          ${signatureHtml}
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

  const handleSaveToClient = async (withSignature: boolean = false) => {
    if (!selectedClientId) {
      toast.error('Selecione um cliente');
      return;
    }

    if (withSignature && !signatureData) {
      toast.error('Capture a assinatura primeiro');
      setActiveTab('signature');
      return;
    }

    setSaving(true);
    try {
      const docType = template.title.toLowerCase().includes('anamnese') ? 'anamnese' : 
                      template.title.toLowerCase().includes('contrato') ? 'contract' : 'other';

      const insertData: any = {
        client_id: selectedClientId,
        template_id: template.id,
        title: template.title,
        description: `Preenchido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        type: docType,
        content: filledContent,
        filled_variables: customVariables,
      };

      if (withSignature && signatureData) {
        insertData.signed_at = new Date().toISOString();
        insertData.signed_by = signedBy;
      }

      const { error } = await supabase
        .from('client_documents')
        .insert(insertData);

      if (error) throw error;

      toast.success(withSignature ? 'Documento assinado e salvo!' : 'Documento salvo no perfil do cliente!');
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

  const handleSignatureSave = (dataUrl: string) => {
    setSignatureData(dataUrl);
    toast.success('Assinatura capturada!');
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
      <DialogContent className="sm:max-w-[950px] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Preencher Documento: {template.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Client & Variables */}
          <ScrollArea className="w-[300px] border-r">
            <div className="p-4 space-y-4">
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
                <Label className="text-sm font-medium">Variáveis</Label>
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

              {signatureData && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                      <PenTool className="h-4 w-4" />
                      Assinatura Capturada ✓
                    </Label>
                    <img 
                      src={signatureData} 
                      alt="Assinatura" 
                      className="w-full border rounded-lg bg-white p-2"
                    />
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {/* Right Panel - Content & Signature */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 pb-2 border-b bg-muted/20 shrink-0">
                <TabsList className="h-8">
                  <TabsTrigger value="content" className="text-xs gap-1.5">
                    <Edit3 className="h-3.5 w-3.5" />
                    Conteúdo
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Visualizar
                  </TabsTrigger>
                  <TabsTrigger value="signature" className="text-xs gap-1.5">
                    <PenTool className="h-3.5 w-3.5" />
                    Assinar
                    {signatureData && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">✓</Badge>}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="content" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <Textarea
                      value={filledContent}
                      onChange={(e) => setFilledContent(e.target.value)}
                      className="min-h-[450px] font-mono text-sm resize-none"
                      placeholder="Conteúdo do documento..."
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border shadow-sm">
                      <h2 className="text-lg font-semibold text-center mb-4 pb-3 border-b">{template.title}</h2>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {filledContent}
                      </pre>
                      {signatureData && (
                        <div className="mt-6 pt-4 border-t">
                          <p className="text-xs text-muted-foreground mb-2">Assinatura Digital:</p>
                          <img src={signatureData} alt="Assinatura" className="max-w-[200px] border rounded p-2 bg-gray-50" />
                          <p className="text-[10px] text-muted-foreground mt-1">Assinado por: {signedBy}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="signature" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Nome do Assinante</Label>
                      <Input
                        value={signedBy}
                        onChange={(e) => setSignedBy(e.target.value)}
                        placeholder="Nome completo..."
                        className="h-9"
                      />
                    </div>
                    
                    <SignaturePad 
                      onSave={handleSignatureSave}
                      width={450}
                      height={180}
                    />

                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <strong>Dica:</strong> Use o mouse ou toque na área acima para desenhar sua assinatura. 
                        Para assinatura com validade jurídica, utilize o{' '}
                        <a 
                          href="https://assinador.iti.br/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Assinador Gov.br
                        </a>.
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4 bg-muted/10 shrink-0">
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handlePrint(!!signatureData)}>
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenGovBr}>
                <FileSignature className="h-4 w-4 mr-1.5" />
                Gov.br
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => handleSaveToClient(false)}
                disabled={saving || !selectedClientId}
              >
                <Save className="h-4 w-4 mr-1.5" />
                Adicionar sem assinar e preencher
              </Button>
              <Button 
                size="sm" 
                onClick={() => handleSaveToClient(true)}
                disabled={saving || !selectedClientId || !signatureData}
              >
                <PenTool className="h-4 w-4 mr-1.5" />
                {saving ? 'Salvando...' : 'Salvar Assinado'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
