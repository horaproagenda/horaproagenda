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
import { FileText, CheckCircle, AlertCircle, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInYears, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DocumentLink {
  id: string;
  template_id: string;
  client_id: string | null;
  professional_id: string | null;
  token: string;
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

interface Client {
  id: string;
  name: string;
  birthdate: string | null;
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

export default function PreencherDocumento() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentLink, setDocumentLink] = useState<DocumentLink | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  
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
      // Fetch the document link by token
      const { data: linkData, error: linkError } = await supabase
        .from('document_fill_links')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (linkError) throw linkError;
      
      if (!linkData) {
        setError('Link não encontrado ou expirado.');
        setLoading(false);
        return;
      }

      // Check if already filled
      if (linkData.status === 'filled') {
        setSubmitted(true);
        setDocumentLink(linkData as DocumentLink);
        setLoading(false);
        return;
      }

      // Check if expired
      if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
        setError('Este link expirou.');
        setLoading(false);
        return;
      }

      setDocumentLink(linkData as DocumentLink);

      // Fetch template
      const { data: templateData, error: templateError } = await supabase
        .from('document_templates')
        .select('id, title, content, variables')
        .eq('id', linkData.template_id)
        .single();

      if (templateError) throw templateError;
      setTemplate(templateData as Template);

      // Fetch professional if assigned
      if (linkData.professional_id) {
        const { data: profData } = await supabase
          .from('professionals')
          .select('id, name')
          .eq('id', linkData.professional_id)
          .single();
        
        if (profData) {
          setProfessional(profData);
          setFormData(prev => ({ ...prev, profissional: profData.name }));
        }
      }

      // Fetch client if assigned - to get birthdate for age calculation
      if (linkData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('id, name, birthdate')
          .eq('id', linkData.client_id)
          .single();
        
        if (clientData) {
          setClient(clientData);
          setFormData(prev => ({ 
            ...prev, 
            cliente: clientData.name,
            nome_cliente: clientData.name,
          }));
          
          // Calculate and set age if birthdate exists
          const age = calculateAge(clientData.birthdate);
          if (age !== null) {
            setFormData(prev => ({ 
              ...prev, 
              idade: age.toString(),
              idade_cliente: age.toString()
            }));
          }
        }
      }

      // Parse template to find question types
      parseTemplateQuestions(templateData.content);

    } catch (err) {
      console.error('Error loading document:', err);
      setError('Erro ao carregar documento.');
    } finally {
      setLoading(false);
    }
  };

  const parseTemplateQuestions = (content: string) => {
    // Find patterns like "( ) Sim ( ) Não" or similar yes/no questions
    const yesNoPattern = /\(\s*\)\s*(Sim|sim)\s*\(\s*\)\s*(Não|nao|Nao)/g;
    const lines = content.split('\n');
    
    const initialYesNo: Record<string, 'sim' | 'nao' | ''> = {};
    const initialInfo: Record<string, string> = {};
    
    lines.forEach((line, index) => {
      if (yesNoPattern.test(line)) {
        initialYesNo[`question_${index}`] = '';
      }
      // Find fields that need text input (e.g., lines ending with _______ or {variable})
      if (line.includes('_____') || line.includes(':')) {
        initialInfo[`info_${index}`] = '';
      }
    });
    
    setYesNoAnswers(initialYesNo);
    setAdditionalInfo(initialInfo);
  };

  const handleSubmit = async () => {
    if (!documentLink || !template) return;

    setSaving(true);
    try {
      // Build filled content
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

      // Add professional name
      if (formData.profissional) {
        filledContent = filledContent.replace(/\{profissional\}/gi, formData.profissional);
        filledContent = filledContent.replace(/\{professional\}/gi, formData.profissional);
        filledContent = filledContent.replace(/\{nome_profissional\}/gi, formData.profissional);
      }

      // Add current date in extended format (e.g., "6 de fevereiro de 2026")
      const currentDateExtended = formatDateExtended(new Date());
      filledContent = filledContent.replace(/\{data\}/gi, currentDateExtended);
      filledContent = filledContent.replace(/\{date\}/gi, currentDateExtended);
      filledContent = filledContent.replace(/\{data_atual\}/gi, currentDateExtended);

      // Add client age if available
      if (client?.birthdate) {
        const age = calculateAge(client.birthdate);
        if (age !== null) {
          filledContent = filledContent.replace(/\{idade\}/gi, age.toString());
          filledContent = filledContent.replace(/\{idade_cliente\}/gi, age.toString());
        }
      }

      // Add client name if available
      if (client?.name) {
        filledContent = filledContent.replace(/\{cliente\}/gi, client.name);
        filledContent = filledContent.replace(/\{nome_cliente\}/gi, client.name);
        filledContent = filledContent.replace(/\{client\}/gi, client.name);
      }

      // Update the document link
      const { error: updateError } = await supabase
        .from('document_fill_links')
        .update({
          status: 'filled',
          filled_at: new Date().toISOString(),
          filled_content: filledContent,
          filled_variables: {
            ...formData,
            ...additionalInfo,
            yesNoAnswers
          }
        })
        .eq('id', documentLink.id);

      if (updateError) throw updateError;

      // If client is linked, save to client_documents
      if (documentLink.client_id) {
        await supabase
          .from('client_documents')
          .insert({
            client_id: documentLink.client_id,
            template_id: template.id,
            title: `${template.title} - Preenchido pelo Cliente`,
            description: `Preenchido via link em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
            type: template.title.toLowerCase().includes('anamnese') ? 'anamnese' : 
                  template.title.toLowerCase().includes('contrato') ? 'contract' : 'other',
            content: filledContent,
            filled_variables: {
              ...formData,
              ...additionalInfo,
              yesNoAnswers
            }
          });
      }

      setSubmitted(true);
      toast.success('Documento enviado com sucesso!');
    } catch (err) {
      console.error('Error saving document:', err);
      toast.error('Erro ao enviar documento.');
    } finally {
      setSaving(false);
    }
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
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Documento Enviado!</h2>
            <p className="text-muted-foreground">
              Obrigado por preencher o documento. Suas respostas foram salvas com sucesso.
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

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
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
          const autoFilled = ['data', 'hora', 'profissional', 'professional'];
          if (!autoFilled.includes(varName.toLowerCase())) {
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
      // Check if it's a field that needs filling (contains underlines or ends with colon)
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
      // Regular text lines (headers, paragraphs)
      else if (trimmedLine.length > 0) {
        // Check if it's a header or section title
        if (trimmedLine.length < 60 && !trimmedLine.includes('.') && index < 5) {
          // Likely a title/header - don't add to form
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
                onClick={handleSubmit}
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
    </div>
  );
}
