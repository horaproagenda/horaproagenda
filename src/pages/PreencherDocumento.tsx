import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, CheckCircle, AlertCircle, Loader2, Send, Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInYears, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';

interface DocumentLinkPayload {
  id: string;
  template_id: string;
  client_id: string | null;
  professional_id: string | null;
  status: string;
  expires_at: string | null;
  filled_at: string | null;
  filled_content: string | null;
  filled_variables: Record<string, string> | null;
  template_title: string;
  template_content: string;
  template_variables: string[] | null;
  professional_name: string | null;
  client_name: string | null;
  client_birthdate: string | null;
  client_cpf: string | null;
  client_phone: string | null;
}

interface DocumentLink {
  id: string;
  template_id: string;
  client_id: string | null;
  professional_id: string | null;
  status: string;
  expires_at: string | null;
  filled_at: string | null;
  filled_content: string | null;
  filled_variables: Record<string, string>;
}

interface Template {
  id: string;
  title: string;
  content: string;
  variables: string[];
}

interface Professional {
  id: string;
  name: string;
}

interface ClientData {
  id: string;
  name: string;
  birthdate: string | null;
  cpf: string | null;
  phone: string | null;
}

// Helper to format date in full Portuguese
const formatDateExtended = (date: Date): string => {
  const day = date.getDate();
  const month = format(date, 'MMMM', { locale: ptBR });
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
};

// Helper to calculate age from birthdate
const calculateAge = (birthdate: string | null): number | null => {
  if (!birthdate) return null;
  try {
    return differenceInYears(new Date(), parseISO(birthdate));
  } catch {
    return null;
  }
};

// Format birthdate for display
const formatBirthdate = (birthdate: string | null): string => {
  if (!birthdate) return '';
  try {
    return format(parseISO(birthdate), 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

export default function PreencherDocumento() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentLink, setDocumentLink] = useState<DocumentLink | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showPdfDownload, setShowPdfDownload] = useState(false);
  const [filledContentForPdf, setFilledContentForPdf] = useState('');
  
  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [yesNoAnswers, setYesNoAnswers] = useState<Record<string, 'sim' | 'nao' | ''>>({});
  const [additionalInfo, setAdditionalInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (token) {
      loadDocument();
    } else {
      setError('Link inválido. Token não encontrado.');
      setLoading(false);
    }
  }, [token]);

  const loadDocument = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_document_fill_link_by_token', {
        p_token: token,
      });

      if (rpcError) throw rpcError;

      const linkData = (data?.[0] ?? null) as DocumentLinkPayload | null;

      if (!linkData) {
        setError('Link não encontrado ou expirado.');
        setLoading(false);
        return;
      }

      if (linkData.status === 'filled') {
        setSubmitted(true);
        setDocumentLink({
          id: linkData.id,
          template_id: linkData.template_id,
          client_id: linkData.client_id,
          professional_id: linkData.professional_id,
          status: linkData.status,
          expires_at: linkData.expires_at,
          filled_at: linkData.filled_at,
          filled_content: linkData.filled_content,
          filled_variables: linkData.filled_variables || {},
        });
        setLoading(false);
        return;
      }

      if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
        setError('Este link expirou.');
        setLoading(false);
        return;
      }

      setDocumentLink({
        id: linkData.id,
        template_id: linkData.template_id,
        client_id: linkData.client_id,
        professional_id: linkData.professional_id,
        status: linkData.status,
        expires_at: linkData.expires_at,
        filled_at: linkData.filled_at,
        filled_content: linkData.filled_content,
        filled_variables: linkData.filled_variables || {},
      });

      const templateData: Template = {
        id: linkData.template_id,
        title: linkData.template_title,
        content: linkData.template_content,
        variables: linkData.template_variables || [],
      };
      setTemplate(templateData);

      if (linkData.professional_id && linkData.professional_name) {
        setProfessional({ id: linkData.professional_id, name: linkData.professional_name });
        setFormData(prev => ({ ...prev, profissional: linkData.professional_name! }));
      }

      if (linkData.client_id && linkData.client_name) {
        const clientData: ClientData = {
          id: linkData.client_id,
          name: linkData.client_name,
          birthdate: linkData.client_birthdate,
          cpf: linkData.client_cpf,
          phone: linkData.client_phone,
        };
        setClient(clientData);
        
        // Auto-fill client data
        const autoFillData: Record<string, string> = {
          cliente: clientData.name,
          nome_cliente: clientData.name,
          nome: clientData.name,
        };
        
        if (clientData.cpf) {
          autoFillData.cpf = clientData.cpf;
        }
        
        if (clientData.birthdate) {
          autoFillData.data_nascimento = formatBirthdate(clientData.birthdate);
          autoFillData.nascimento = formatBirthdate(clientData.birthdate);
          const age = calculateAge(clientData.birthdate);
          if (age !== null) {
            autoFillData.idade = age.toString();
            autoFillData.idade_cliente = age.toString();
          }
        }
        
        if (clientData.phone) {
          autoFillData.telefone = clientData.phone;
        }
        
        setFormData(prev => ({ ...prev, ...autoFillData }));
      }

      parseTemplateQuestions(templateData.content);
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Erro ao carregar documento.');
    } finally {
      setLoading(false);
    }
  };

  const parseTemplateQuestions = (content: string) => {
    const yesNoPattern = /\(\s*\)\s*(Sim|sim)\s*\(\s*\)\s*(Não|nao|Nao)/g;
    const lines = content.split('\n');
    
    const initialYesNo: Record<string, 'sim' | 'nao' | ''> = {};
    const initialInfo: Record<string, string> = {};
    
    lines.forEach((line, index) => {
      if (yesNoPattern.test(line)) {
        initialYesNo[`question_${index}`] = '';
      }
      if (line.includes('_____') || line.includes(':')) {
        initialInfo[`info_${index}`] = '';
      }
    });
    
    setYesNoAnswers(initialYesNo);
    setAdditionalInfo(initialInfo);
  };

  const buildFilledContent = (): string => {
    if (!template) return '';
    
    let filledContent = template.content;
    
    // Replace yes/no questions with X
    Object.entries(yesNoAnswers).forEach(([key, value]) => {
      if (value === 'sim') {
        filledContent = filledContent.replace(/\(\s*\)\s*(Sim|sim)/g, '(X) $1');
        filledContent = filledContent.replace(/\(\s*\)\s*(Não|nao|Nao)/g, '( ) $1');
      } else if (value === 'nao') {
        filledContent = filledContent.replace(/\(\s*\)\s*(Sim|sim)/g, '( ) $1');
        filledContent = filledContent.replace(/\(\s*\)\s*(Não|nao|Nao)/g, '(X) $1');
      }
    });

    // Apply form data variables
    Object.entries(formData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      filledContent = filledContent.replace(regex, value);
    });

    // Replace [TEXTO_LIVRE] placeholders with filled text
    Object.entries(additionalInfo).forEach(([key, value]) => {
      if (key.startsWith('texto_livre_') && value) {
        // Replace the nth [TEXTO_LIVRE] placeholder
        filledContent = filledContent.replace('[TEXTO_LIVRE]', value);
      }
    });

    // Add professional name
    if (formData.profissional) {
      filledContent = filledContent.replace(/\{profissional\}/gi, formData.profissional);
      filledContent = filledContent.replace(/\{professional\}/gi, formData.profissional);
      filledContent = filledContent.replace(/\{nome_profissional\}/gi, formData.profissional);
    }

    // Add current date in extended format
    const currentDateExtended = formatDateExtended(new Date());
    filledContent = filledContent.replace(/\{data\}/gi, currentDateExtended);
    filledContent = filledContent.replace(/\{date\}/gi, currentDateExtended);
    filledContent = filledContent.replace(/\{data_atual\}/gi, currentDateExtended);

    // Add client data
    if (client?.birthdate) {
      const age = calculateAge(client.birthdate);
      if (age !== null) {
        filledContent = filledContent.replace(/\{idade\}/gi, age.toString());
        filledContent = filledContent.replace(/\{idade_cliente\}/gi, age.toString());
      }
      filledContent = filledContent.replace(/\{data_nascimento\}/gi, formatBirthdate(client.birthdate));
      filledContent = filledContent.replace(/\{nascimento\}/gi, formatBirthdate(client.birthdate));
    }

    if (client?.name) {
      filledContent = filledContent.replace(/\{cliente\}/gi, client.name);
      filledContent = filledContent.replace(/\{nome_cliente\}/gi, client.name);
      filledContent = filledContent.replace(/\{client\}/gi, client.name);
      filledContent = filledContent.replace(/\{nome\}/gi, client.name);
    }

    if (client?.cpf) {
      filledContent = filledContent.replace(/\{cpf\}/gi, client.cpf);
    }

    if (client?.phone) {
      filledContent = filledContent.replace(/\{telefone\}/gi, client.phone);
    }

    return filledContent;
  };

  const handleConfirmSubmit = () => {
    setShowConfirmDialog(true);
  };

  const handleSubmit = async () => {
    if (!documentLink || !template) return;
    setShowConfirmDialog(false);

    setSaving(true);
    try {
      const filledContent = buildFilledContent();

      const payload = {
        ...formData,
        ...additionalInfo,
        yesNoAnswers,
      };

      const { error: submitError } = await supabase.rpc('submit_document_fill_by_token', {
        p_token: token,
        p_filled_content: filledContent,
        p_filled_variables: payload,
      });

      if (submitError) throw submitError;

      setFilledContentForPdf(filledContent);
      setSubmitted(true);
      setShowPdfDownload(true);
      toast.success('Documento enviado com sucesso!');
    } catch (err) {
      console.error('Error saving document:', err);
      toast.error('Erro ao enviar documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!template) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;
    
    // Remove accents for PDF compatibility
    const removeAccents = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const title = removeAccents(template.title);
    doc.text(title, pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Date
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(removeAccents(`Data de preenchimento: ${format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`), margin, y);
    y += 8;

    // Client info
    if (client?.name) {
      doc.text(removeAccents(`Cliente: ${client.name}`), margin, y);
      y += 5;
    }
    if (client?.cpf) {
      doc.text(removeAccents(`CPF: ${client.cpf}`), margin, y);
      y += 5;
    }
    y += 5;

    // Separator
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Content
    doc.setFontSize(10);
    const content = filledContentForPdf || buildFilledContent();
    const lines = doc.splitTextToSize(removeAccents(content), maxWidth);
    
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 5;
    }

    // Signature area
    y += 15;
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 40;
    }
    doc.line(margin, y, pageWidth / 2 + 20, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(removeAccents('Assinatura'), margin, y);
    y += 10;
    doc.text(removeAccents(`Data: ____/____/________`), margin, y);

    doc.save(removeAccents(`${template.title} - ${client?.name || 'Documento'}.pdf`));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Carregando documento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Erro</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center space-y-4">
            <ShieldCheck className="h-16 w-16 mx-auto text-green-500 mb-2" />
            <h2 className="text-xl font-semibold">Documento Assinado!</h2>
            <p className="text-muted-foreground text-sm">
              Suas respostas foram salvas com sucesso. Este documento não pode mais ser alterado.
            </p>
            
            {showPdfDownload && (
              <div className="space-y-3 pt-4 border-t">
                <p className="text-sm font-medium">Próximo passo:</p>
                <ol className="text-sm text-muted-foreground text-left space-y-2 mx-auto max-w-xs">
                  <li>1. Baixe o PDF do documento preenchido</li>
                  <li>2. Assine o PDF pelo <strong>Gov.br</strong></li>
                  <li>3. Envie o PDF assinado de volta ao profissional</li>
                </ol>
                <Button onClick={handleDownloadPdf} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  Baixar PDF para Assinatura
                </Button>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground pt-4">
              Se você acessar este link novamente, verá esta mensagem de confirmação.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!template) return null;

  // Parse template to create interactive form
  const renderInteractiveForm = () => {
    const lines = template.content.split('\n');
    const formElements: JSX.Element[] = [];
    let questionIndex = 0;
    let textoLivreIndex = 0;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Check if it's a [TEXTO_LIVRE] placeholder
      if (trimmedLine.includes('[TEXTO_LIVRE]')) {
        const labelText = trimmedLine.replace('[TEXTO_LIVRE]', '').replace(/:$/, '').trim();
        const fieldKey = `texto_livre_${textoLivreIndex}`;
        
        formElements.push(
          <div key={`tl_${index}`} className="py-3 border-b border-muted">
            <Label className="text-sm font-medium mb-2 block">
              {labelText || `Campo de texto ${textoLivreIndex + 1}`}
            </Label>
            <Textarea
              value={additionalInfo[fieldKey] || ''}
              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, [fieldKey]: e.target.value }))}
              placeholder="Digite sua resposta aqui..."
              rows={3}
              className="resize-none"
            />
          </div>
        );
        textoLivreIndex++;
        return;
      }

      // Check if it's a yes/no question
      if (/\(\s*\)\s*(Sim|sim)\s*\(\s*\)\s*(Não|nao|Nao)/i.test(line)) {
        const questionKey = `question_${questionIndex}`;
        const questionText = line.replace(/\(\s*\)\s*(Sim|sim)\s*\(\s*\)\s*(Não|nao|Nao)/gi, '').trim();
        
        formElements.push(
          <div key={index} className="py-3 border-b border-muted">
            <Label className="text-sm font-medium mb-2 block">{questionText || `Pergunta ${questionIndex + 1}`}</Label>
            <RadioGroup
              value={yesNoAnswers[questionKey] || ''}
              onValueChange={(value) => setYesNoAnswers(prev => ({ ...prev, [questionKey]: value as 'sim' | 'nao' }))}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sim" id={`${questionKey}-sim`} />
                <Label htmlFor={`${questionKey}-sim`} className="cursor-pointer">Sim</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao" id={`${questionKey}-nao`} />
                <Label htmlFor={`${questionKey}-nao`} className="cursor-pointer">Não</Label>
              </div>
            </RadioGroup>
          </div>
        );
        questionIndex++;
      }
      // Check if line has a variable placeholder
      else if (/{[^}]+}/.test(line)) {
        const variables = line.match(/{([^}]+)}/g) || [];
        variables.forEach((variable) => {
          const varName = variable.slice(1, -1);
          const autoFilled = ['data', 'hora', 'profissional', 'professional', 'data_atual', 'date'];
          // Also skip if already auto-filled by client data
          const clientAutoFilled = ['cliente', 'nome_cliente', 'nome', 'cpf', 'idade', 'idade_cliente', 'data_nascimento', 'nascimento', 'telefone'];
          if (!autoFilled.includes(varName.toLowerCase()) && !clientAutoFilled.includes(varName.toLowerCase())) {
            formElements.push(
              <div key={`${index}-${varName}`} className="py-3 border-b border-muted">
                <Label className="text-sm font-medium mb-2 block capitalize">{varName.replace(/_/g, ' ')}</Label>
                <Input
                  value={formData[varName] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [varName]: e.target.value }))}
                  placeholder={`Digite ${varName.replace(/_/g, ' ')}...`}
                  className="h-9"
                />
              </div>
            );
          }
        });
      }
      // Check if it's a field that needs filling
      else if (trimmedLine.includes('_____') || (trimmedLine.endsWith(':') && trimmedLine.length > 3)) {
        const fieldKey = `field_${index}`;
        const fieldLabel = trimmedLine.replace(/_+/g, '').replace(/:$/, '').trim();
        
        if (fieldLabel.length > 2) {
          formElements.push(
            <div key={index} className="py-3 border-b border-muted">
              <Label className="text-sm font-medium mb-2 block">{fieldLabel}</Label>
              <Input
                value={additionalInfo[fieldKey] || ''}
                onChange={(e) => setAdditionalInfo(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                placeholder="Digite sua resposta..."
                className="h-9"
              />
            </div>
          );
        }
      }
    });

    return formElements;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{template.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Preencha o documento abaixo
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[60vh]">
              <div className="p-6 space-y-4">
                {/* Auto-filled client data display */}
                {client && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Dados preenchidos automaticamente:</p>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      <span><strong>Nome:</strong> {client.name}</span>
                      {client.cpf && <span><strong>CPF:</strong> {client.cpf}</span>}
                      {client.birthdate && <span><strong>Nascimento:</strong> {formatBirthdate(client.birthdate)}</span>}
                      {client.birthdate && <span><strong>Idade:</strong> {calculateAge(client.birthdate)} anos</span>}
                    </div>
                  </div>
                )}

                {/* Professional name field */}
                <div className="py-3 border-b border-muted">
                  <Label className="text-sm font-medium mb-2 block">Nome do Profissional</Label>
                  <Input
                    value={formData.profissional || professional?.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, profissional: e.target.value }))}
                    placeholder="Nome do profissional responsável..."
                    className="h-9"
                  />
                </div>

                <Separator className="my-4" />

                {/* Render interactive form fields */}
                {renderInteractiveForm()}

                {/* General observations */}
                <div className="py-3">
                  <Label className="text-sm font-medium mb-2 block">Observações Adicionais</Label>
                  <Textarea
                    value={additionalInfo.observacoes || ''}
                    onChange={(e) => setAdditionalInfo(prev => ({ ...prev, observacoes: e.target.value }))}
                    placeholder="Adicione informações complementares se necessário..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="border-t p-4 bg-muted/10">
              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={handleConfirmSubmit}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {saving ? 'Enviando...' : 'Enviar Documento'}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Ao enviar, você concorda que as informações fornecidas são verdadeiras.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Documento gerado em {format(new Date(), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio do documento</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Todas as informações foram preenchidas corretamente?
              </p>
              <p className="font-medium text-foreground">
                Após confirmar, nenhuma alteração poderá ser feita neste documento.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>
              Confirmar e Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
