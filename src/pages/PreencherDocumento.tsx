import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { differenceInYears, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
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
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildFilledDocumentContent,
  extractDocumentPrefillSnapshot,
  isAutoFilledVariable,
  normalizeDocumentLinkPayload,
  tokenizeDocumentLine,
  type DocumentFieldToken,
} from '@/lib/documentTemplateFields';

interface DocumentLinkPayload {
  id: string;
  template_id: string;
  client_id: string | null;
  professional_id: string | null;
  status: string;
  expires_at: string | null;
  filled_at: string | null;
  filled_content: string | null;
  filled_variables: Record<string, unknown> | null;
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
  filled_variables: Record<string, unknown>;
}

interface Template {
  id: string;
  title: string;
  content: string;
  variables: string[];
}

interface Professional {
  id: string | null;
  name: string | null;
}

interface ClientData {
  id: string | null;
  name: string | null;
  birthdate: string | null;
  cpf: string | null;
  phone: string | null;
}

const formatDateExtended = (date: Date): string => {
  const day = date.getDate();
  const month = format(date, 'MMMM', { locale: ptBR });
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
};

const calculateAge = (birthdate: string | null): number | null => {
  if (!birthdate) return null;
  try {
    return differenceInYears(new Date(), parseISO(birthdate));
  } catch {
    return null;
  }
};

const formatBirthdate = (birthdate: string | null): string => {
  if (!birthdate) return '';
  try {
    return format(parseISO(birthdate), 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const formatNumber = (value: string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toString() : value;
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
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [yesNoAnswers, setYesNoAnswers] = useState<Record<string, 'sim' | 'nao' | ''>>({});
  const [additionalInfo, setAdditionalInfo] = useState<Record<string, string>>({});
  // CPF authentication gate
  const [authenticated, setAuthenticated] = useState(false);
  const [cpfInput, setCpfInput] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [cpfAttempts, setCpfAttempts] = useState(0);

  const onlyDigits = (value: string) => value.replace(/\D/g, '');

  const handleCpfSubmit = () => {
    const expected = onlyDigits(client?.cpf ?? '');
    const provided = onlyDigits(cpfInput);

    if (!expected) {
      // No CPF on file — cannot authenticate, but allow access (legacy links)
      setAuthenticated(true);
      return;
    }

    if (provided.length !== 11) {
      setCpfError('Digite os 11 dígitos do seu CPF.');
      return;
    }

    if (provided === expected) {
      setCpfError(null);
      setAuthenticated(true);
      return;
    }

    const next = cpfAttempts + 1;
    setCpfAttempts(next);
    if (next >= 5) {
      setCpfError('Muitas tentativas incorretas. Entre em contato com o profissional.');
    } else {
      setCpfError(`CPF não confere com o cadastro. Tentativa ${next} de 5.`);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Link inválido. Token não encontrado.');
      setLoading(false);
      return;
    }

    void loadDocument();
  }, [token]);

  const loadDocument = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_document_fill_link_by_token', { p_token: token });
      if (rpcError) throw rpcError;

      const linkData = normalizeDocumentLinkPayload<DocumentLinkPayload>(data);
      if (!linkData) {
        setError('Link não encontrado ou expirado.');
        return;
      }

      if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
        setError('Este link expirou.');
        return;
      }

      const { data: templateData, error: templateError } = await supabase
        .from('document_templates')
        .select('id, title, content, variables')
        .eq('id', linkData.template_id)
        .maybeSingle();

      if (templateError) throw templateError;
      if (!templateData) {
        setError('O modelo deste documento não foi encontrado.');
        return;
      }

      const snapshot = extractDocumentPrefillSnapshot(linkData.filled_variables);
      const clientSnapshot: ClientData | null = snapshot.client
        ? {
            id: snapshot.client.id ?? null,
            name: snapshot.client.name ?? null,
            birthdate: snapshot.client.birthdate ?? null,
            cpf: snapshot.client.cpf ?? null,
            phone: snapshot.client.phone ?? null,
          }
        : null;
      const professionalSnapshot: Professional | null = snapshot.professional
        ? {
            id: snapshot.professional.id ?? null,
            name: snapshot.professional.name ?? null,
          }
        : null;

      const currentDate = new Date();
      const initialFormData: Record<string, string> = {
        ...(snapshot.formData || {}),
        data: formatDateExtended(currentDate),
        date: formatDateExtended(currentDate),
        data_atual: formatDateExtended(currentDate),
        hora: format(currentDate, 'HH:mm'),
        data_extenso: formatDateExtended(currentDate),
      };

      if (clientSnapshot?.name) {
        initialFormData.cliente = clientSnapshot.name;
        initialFormData.nome_cliente = clientSnapshot.name;
        initialFormData.nome = clientSnapshot.name;
      }
      if (clientSnapshot?.cpf) {
        initialFormData.cpf = clientSnapshot.cpf;
      }
      if (clientSnapshot?.phone) {
        initialFormData.telefone = clientSnapshot.phone;
      }
      if (clientSnapshot?.birthdate) {
        const formattedBirthdate = formatBirthdate(clientSnapshot.birthdate);
        initialFormData.data_nascimento = formattedBirthdate;
        initialFormData.nascimento = formattedBirthdate;
        const age = calculateAge(clientSnapshot.birthdate);
        if (age !== null) {
          initialFormData.idade = formatNumber(String(age));
          initialFormData.idade_cliente = formatNumber(String(age));
        }
      }
      if (professionalSnapshot?.name) {
        initialFormData.profissional = professionalSnapshot.name;
        initialFormData.professional = professionalSnapshot.name;
        initialFormData.nome_profissional = professionalSnapshot.name;
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
      setTemplate({
        id: templateData.id,
        title: templateData.title,
        content: templateData.content,
        variables: templateData.variables || [],
      });
      setClient(clientSnapshot);
      setProfessional(professionalSnapshot);
      setFormData(initialFormData);

      if (linkData.status === 'filled') {
        setSubmitted(true);
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Erro ao carregar documento.');
    } finally {
      setLoading(false);
    }
  };

  const buildFilledContent = (): string => {
    if (!template) return '';

    let content = buildFilledDocumentContent({
      content: template.content,
      formData,
      yesNoAnswers,
      additionalInfo,
    });

    if (additionalInfo.observacoes?.trim()) {
      content = `${content}\n\nObservações adicionais: ${additionalInfo.observacoes.trim()}`;
    }

    return content;
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
    const removeAccents = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(removeAccents(template.title), pageWidth / 2, y, { align: 'center' });
    y += 12;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(removeAccents(`Data de preenchimento: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), margin, y);
    y += 8;

    if (client?.name) {
      doc.text(removeAccents(`Cliente: ${client.name}`), margin, y);
      y += 5;
    }
    if (client?.cpf) {
      doc.text(removeAccents(`CPF: ${client.cpf}`), margin, y);
      y += 5;
    }
    y += 5;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

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
    doc.text(removeAccents('Data: ____/____/________'), margin, y);

    doc.save(removeAccents(`${template.title} - ${client?.name || 'Documento'}.pdf`));
  };

  const renderToken = (token: DocumentFieldToken, lineIndex: number, tokenIndex: number) => {
    switch (token.type) {
      case 'text':
        return <span key={`${lineIndex}-${tokenIndex}`} className="whitespace-pre-wrap">{token.value}</span>;
      case 'variable': {
        const value = formData[token.fieldKey] || '';
        if (isAutoFilledVariable(token.name)) {
          return (
            <span key={`${lineIndex}-${tokenIndex}`} className="inline-flex min-h-9 min-w-[120px] items-center rounded-md border bg-muted px-3 py-2 text-sm font-medium">
              {value || '—'}
            </span>
          );
        }
        return (
          <Input
            key={`${lineIndex}-${tokenIndex}`}
            value={value}
            onChange={(event) => setFormData(prev => ({ ...prev, [token.fieldKey]: event.target.value }))}
            placeholder={token.label || token.name}
            className="inline-flex h-9 min-w-[180px] w-[220px] align-middle"
          />
        );
      }
      case 'yesno':
        return (
          <RadioGroup
            key={`${lineIndex}-${tokenIndex}`}
            value={yesNoAnswers[token.fieldKey] || ''}
            onValueChange={(value) => setYesNoAnswers(prev => ({ ...prev, [token.fieldKey]: value as 'sim' | 'nao' }))}
            className="inline-flex flex-row items-center gap-4 align-middle"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sim" id={`${token.fieldKey}-sim`} />
              <Label htmlFor={`${token.fieldKey}-sim`} className="cursor-pointer">Sim</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nao" id={`${token.fieldKey}-nao`} />
              <Label htmlFor={`${token.fieldKey}-nao`} className="cursor-pointer">Não</Label>
            </div>
          </RadioGroup>
        );
      case 'freeText':
        return (
          <Textarea
            key={`${lineIndex}-${tokenIndex}`}
            value={additionalInfo[token.fieldKey] || ''}
            onChange={(event) => setAdditionalInfo(prev => ({ ...prev, [token.fieldKey]: event.target.value }))}
            placeholder="Digite sua resposta aqui..."
            rows={3}
            className="mt-2 min-h-[96px] w-full resize-none"
          />
        );
      case 'blankField':
        return (
          <Input
            key={`${lineIndex}-${tokenIndex}`}
            value={additionalInfo[token.fieldKey] || ''}
            onChange={(event) => setAdditionalInfo(prev => ({ ...prev, [token.fieldKey]: event.target.value }))}
            placeholder="Digite sua resposta..."
            className="inline-flex h-9 min-w-[180px] w-[220px] align-middle"
          />
        );
      default:
        return null;
    }
  };

  const renderInteractiveForm = () => {
    if (!template) return null;

    return template.content.split('\n').map((line, index) => {
      const tokens = tokenizeDocumentLine(line, index);
      const hasBlockField = tokens.some(token => token.type === 'freeText');

      return (
        <div key={`line-${index}`} className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
          <div className={`flex flex-wrap items-center gap-2 text-sm leading-7 ${hasBlockField ? 'flex-col items-stretch' : ''}`}>
            {tokens.map((token, tokenIndex) => renderToken(token, index, tokenIndex))}
          </div>
        </div>
      );
    });
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
            <ShieldCheck className="h-16 w-16 mx-auto text-primary mb-2" />
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

  // CPF authentication gate — only when a client is linked AND has CPF on file
  if (client?.cpf && !authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center border-b">
            <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-lg mt-3">Verificação de Identidade</CardTitle>
            <p className="text-sm text-muted-foreground">
              Para acessar e assinar o documento <strong>"{template.title}"</strong>, confirme seu CPF cadastrado.
            </p>
          </CardHeader>
          <CardContent className="py-6 space-y-4">
            {client.name && (
              <div className="rounded-md bg-muted/30 border p-2.5 text-center text-sm">
                <span className="text-muted-foreground">Documento para: </span>
                <span className="font-medium">{client.name}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cpf-input" className="text-sm">Digite seu CPF</Label>
              <Input
                id="cpf-input"
                inputMode="numeric"
                autoFocus
                placeholder="000.000.000-00"
                value={cpfInput}
                onChange={(event) => {
                  setCpfInput(event.target.value);
                  setCpfError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCpfSubmit();
                }}
                disabled={cpfAttempts >= 5}
                className="text-center text-lg tracking-wider h-11"
                maxLength={14}
              />
              {cpfError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {cpfError}
                </p>
              )}
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handleCpfSubmit}
              disabled={cpfAttempts >= 5}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Acessar Documento
            </Button>
            <p className="text-[11px] text-center text-muted-foreground pt-2">
              🔒 Este documento é privado e foi enviado especificamente para você. Apenas o titular do CPF cadastrado pode acessá-lo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-xl">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{template.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Preencha o documento abaixo</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[70vh]">
              <div className="p-6 space-y-4">
                {client && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Dados preenchidos automaticamente:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                      {client.name && <span><strong>Nome:</strong> {client.name}</span>}
                      {client.cpf && <span><strong>CPF:</strong> {client.cpf}</span>}
                      {client.birthdate && <span><strong>Nascimento:</strong> {formatBirthdate(client.birthdate)}</span>}
                      {client.birthdate && <span><strong>Idade:</strong> {calculateAge(client.birthdate)} anos</span>}
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
                  <Label className="text-sm font-medium">Nome do Profissional</Label>
                  <Input
                    value={formData.profissional || professional?.name || ''}
                    onChange={(event) => setFormData(prev => ({ ...prev, profissional: event.target.value, professional: event.target.value, nome_profissional: event.target.value }))}
                    placeholder="Nome do profissional responsável..."
                    className="h-9"
                  />
                </div>

                <Separator className="my-4" />

                {renderInteractiveForm()}

                <div className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
                  <Label className="text-sm font-medium">Observações Adicionais</Label>
                  <Textarea
                    value={additionalInfo.observacoes || ''}
                    onChange={(event) => setAdditionalInfo(prev => ({ ...prev, observacoes: event.target.value }))}
                    placeholder="Adicione informações complementares se necessário..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="border-t p-4 bg-muted/10">
              <Button className="w-full gap-2" size="lg" onClick={() => setShowConfirmDialog(true)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {saving ? 'Enviando...' : 'Enviar Documento'}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Ao enviar, você confirma que todas as informações foram revisadas e não poderão mais ser alteradas.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Documento gerado em {format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}
        </p>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio do documento</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Todas as informações foram preenchidas corretamente?</p>
              <p className="font-medium text-foreground">
                Após confirmar, nenhuma alteração poderá ser feita neste documento.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Confirmar e Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
