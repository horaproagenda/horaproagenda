import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle2, ShieldCheck, AlertTriangle, FileText, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { isValidCPF } from '@/lib/cpfValidator';
import { validateCNPJ } from '@/lib/validationSchemas';
import { fetchAddressByCep, formatCep } from '@/lib/viacep';
import {
  InteractiveDocumentFiller,
  buildContentFromState,
  emptyDocumentState,
  type InteractiveDocumentState,
} from '@/components/clients/InteractiveDocumentFiller';
import { generateClientDocumentPdf, generateCombinedClientDocumentsPdf } from '@/lib/clientDocumentPdf';

const REFERRAL_SOURCES = ['Instagram', 'Facebook', 'Google', 'Indicação de amigo', 'Indicação de cliente', 'Passou na frente', 'WhatsApp', 'TikTok', 'Outros'];
const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const formatCnpj = (v: string) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};
const formatPhone = (v: string) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};
const formatCpfMask = (v: string) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

interface LinkData {
  id: string;
  expires_at: string | null;
  already_used: boolean;
  single_use: boolean;
  professional: { id: string; name: string } | null;
  templates: Array<{ id: string; title: string; content: string; variables?: any }>;
}

type Step = 'form' | 'documents' | 'success';

export default function CadastroCliente() {
  const { token } = useParams<{ token: string }>();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [cepLoading, setCepLoading] = useState(false);

  const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', cpf: '', cnpj: '', company_name: '',
    birthdate: '', referral_source: '', notes: '',
    cep: '', address_street: '', address_number: '', address_complement: '',
    address_neighborhood: '', address_city: '', address_state: '',
  });

  // Documents step state
  const [docStates, setDocStates] = useState<Record<string, InteractiveDocumentState>>({});
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [signedBy, setSignedBy] = useState('');
  // Generated content per template (filled after submit, used for PDF downloads)
  const [generatedDocs, setGeneratedDocs] = useState<Array<{ id: string; title: string; content: string }>>([]);

  const calcAge = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return String(a);
  };

  // Auto-fill map from registration form to document variables.
  const autoFillMap = useMemo<Record<string, string>>(() => {
    const today = new Date().toLocaleDateString('pt-BR');
    const nascimentoBR = form.birthdate
      ? new Date(form.birthdate + 'T12:00:00').toLocaleDateString('pt-BR')
      : '';
    const endereco = [
      form.address_street && `${form.address_street}${form.address_number ? ', ' + form.address_number : ''}`,
      form.address_complement,
      form.address_neighborhood,
      form.address_city && form.address_state ? `${form.address_city}/${form.address_state}` : (form.address_city || form.address_state),
      form.cep,
    ].filter(Boolean).join(' - ');
    const profName = linkData?.professional?.name || '';
    return {
      nome: form.name,
      nome_cliente: form.name,
      cliente: form.name,
      cpf: form.cpf,
      cnpj: form.cnpj,
      telefone: form.phone,
      celular: form.phone,
      email: form.email,
      'e-mail': form.email,
      nascimento: nascimentoBR,
      data_nascimento: nascimentoBR,
      idade: calcAge(form.birthdate),
      idade_cliente: calcAge(form.birthdate),
      data: today,
      data_atual: today,
      date: today,
      data_extenso: today,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      endereco,
      'endereço': endereco,
      cep: form.cep,
      cidade: form.address_city,
      uf: form.address_state,
      razao_social: form.company_name,
      profissional: profName,
      professional: profName,
      nome_profissional: profName,
    };
  }, [form, linkData]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoadingLink(true);
      const { data, error } = await supabase.rpc('get_client_registration_link_by_token', { p_token: token });
      if (error || !data) {
        setLinkError('Link inválido ou expirado.');
      } else {
        const ld = data as unknown as LinkData;
        if (ld.single_use && ld.already_used) {
          setLinkError('Este link de cadastro já foi utilizado.');
        } else {
          setLinkData(ld);
        }
      }
      setLoadingLink(false);
    })();
  }, [token]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleCepBlur = async () => {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetchAddressByCep(digits);
      if (!r) { toast.error('CEP não encontrado'); return; }
      setForm((f) => ({
        ...f,
        address_street: r.logradouro || f.address_street,
        address_neighborhood: r.bairro || f.address_neighborhood,
        address_city: r.localidade || f.address_city,
        address_state: (r.uf || f.address_state).toUpperCase(),
      }));
    } finally { setCepLoading(false); }
  };

  const validateForm = (): string | null => {
    if (!form.name || form.name.trim().length < 2) return 'Informe o nome completo.';
    const phoneDigits = form.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) return 'Telefone inválido.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'E-mail inválido.';
    if (personType === 'pf') {
      if (!form.cpf || !isValidCPF(form.cpf)) return 'CPF inválido.';
      if (form.birthdate) {
        const d = new Date(form.birthdate);
        if (isNaN(d.getTime()) || d > new Date()) return 'Data de nascimento inválida.';
      }
    } else {
      if (!form.cnpj || !validateCNPJ(form.cnpj)) return 'CNPJ inválido (14 dígitos).';
    }
    if (form.cep) {
      const cd = form.cep.replace(/\D/g, '');
      if (cd.length !== 8) return 'CEP deve ter 8 dígitos.';
    }
    if (form.address_state && !UF_LIST.includes(form.address_state.toUpperCase())) return 'UF inválida.';
    return null;
  };

  // Advance from form step. If templates exist, go to documents step (auto-fill them first).
  const handleFormNext = () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }

    const templates = linkData?.templates || [];
    if (templates.length === 0) {
      void submit([]);
      return;
    }

    // Seed each document state with auto-filled data
    const seed: Record<string, InteractiveDocumentState> = {};
    templates.forEach((t) => {
      const base = emptyDocumentState();
      base.formData = { ...autoFillMap };
      seed[t.id] = base;
    });
    setDocStates(seed);
    setSignedBy(form.name);
    setCurrentDocIndex(0);
    setStep('documents');
  };

  const submit = async (filledDocs: Array<{ template_id: string; content: string; variables: Record<string, unknown>; signed_by: string }>) => {
    setSubmitting(true);
    try {
      const { data: result, error: invokeErr } = await supabase.functions.invoke(
        'submit-client-registration',
        {
          body: {
            token,
            person_type: personType,
            ...form,
            filled_documents: filledDocs,
          },
        }
      );

      if (invokeErr) {
        let msg = invokeErr.message || 'Erro ao enviar cadastro';
        try {
          const ctx: any = (invokeErr as any).context;
          if (ctx?.json) {
            const j = await ctx.json();
            msg = j.error || j.errors?.[0]?.message || msg;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (!result?.success) {
        throw new Error(result?.error || result?.errors?.[0]?.message || 'Erro ao enviar cadastro');
      }

      // Save generated docs to allow PDF download from success screen
      setGeneratedDocs(filledDocs.map((d) => {
        const tpl = linkData?.templates.find((t) => t.id === d.template_id);
        return { id: d.template_id, title: tpl?.title || 'Documento', content: d.content };
      }));
      setStep('success');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar cadastro');
    } finally { setSubmitting(false); }
  };

  const handleDocsSubmit = () => {
    if (!signedBy.trim()) { toast.error('Informe seu nome completo para assinar.'); return; }
    const templates = linkData?.templates || [];
    const filled = templates.map((t) => {
      const state = docStates[t.id] || emptyDocumentState();
      // Ensure signed_by is reflected in the body where {nome} is used after editing
      const withSignedName: InteractiveDocumentState = {
        ...state,
        formData: { ...state.formData, nome: signedBy || state.formData.nome || form.name },
      };
      const content = buildContentFromState(t.content, withSignedName);
      return {
        template_id: t.id,
        content,
        variables: { ...withSignedName.formData, data: new Date().toLocaleDateString('pt-BR'), signed_by: signedBy },
        signed_by: signedBy,
      };
    });
    void submit(filled);
  };

  const downloadDocPdf = (doc: { id: string; title: string; content: string }) => {
    generateClientDocumentPdf({
      title: doc.title,
      filledContent: doc.content,
      header: {
        name: signedBy || form.name,
        cpf: form.cpf || null,
        birthdate: form.birthdate
          ? new Date(form.birthdate + 'T12:00:00').toLocaleDateString('pt-BR')
          : null,
        professionalName: linkData?.professional?.name || null,
      },
    });
  };

  const downloadAllPdfs = () => {
    generatedDocs.forEach((d, i) => setTimeout(() => downloadDocPdf(d), i * 250));
  };

  // ---------- RENDER ----------

  if (loadingLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (linkError || !linkData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Link indisponível</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{linkError || 'Link não encontrado.'}</p>
            <p className="text-xs text-muted-foreground mt-2">Solicite um novo link à sua profissional.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <CardTitle className="mt-2">Cadastro enviado!</CardTitle>
            <CardDescription>
              Seus dados foram registrados com sucesso. {linkData.professional?.name ? `${linkData.professional.name} entrará em contato em breve.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Não é necessário criar conta nem fazer login. Você pode fechar esta página com tranquilidade.</span>
            </div>

            {generatedDocs.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Baixar documentos preenchidos em PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Baixe, assine pelo Gov.br (ou à mão) e envie de volta ao profissional.
                  </p>
                </div>
                <div className="space-y-2">
                  {generatedDocs.map((d) => (
                    <Button
                      key={d.id}
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => downloadDocPdf(d)}
                    >
                      <span className="flex items-center gap-2 text-left truncate">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">{d.title}</span>
                      </span>
                      <Download className="h-4 w-4 shrink-0" />
                    </Button>
                  ))}
                </div>
                {generatedDocs.length > 1 && (
                  <Button className="w-full" onClick={downloadAllPdfs}>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar todos os PDFs
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'documents') {
    const templates = linkData.templates;
    const current = templates[currentDocIndex];
    const state = docStates[current.id] || emptyDocumentState();
    const isLast = currentDocIndex === templates.length - 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Documento {currentDocIndex + 1} de {templates.length}
              </p>
              <h1 className="text-xl font-semibold">{current.title}</h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Dados do cadastro já foram preenchidos automaticamente
            </div>
          </div>

          <Card className="shadow-xl">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                {form.name && <div><span className="text-muted-foreground">Nome:</span> <strong>{form.name}</strong></div>}
                {form.cpf && <div><span className="text-muted-foreground">CPF:</span> <strong>{form.cpf}</strong></div>}
                {form.birthdate && <div><span className="text-muted-foreground">Nascimento:</span> <strong>{new Date(form.birthdate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>}
                <div><span className="text-muted-foreground">Data:</span> <strong>{new Date().toLocaleDateString('pt-BR')}</strong></div>
              </div>

              <InteractiveDocumentFiller
                rawContent={current.content}
                state={state}
                onChange={(next) => setDocStates((p) => ({ ...p, [current.id]: next }))}
              />

              {isLast && (
                <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <Label className="text-sm font-medium">Assinatura (digite seu nome completo) *</Label>
                  <Input
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    placeholder="Nome completo para assinatura"
                    className="bg-background"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (currentDocIndex === 0) setStep('form');
                else setCurrentDocIndex((i) => i - 1);
              }}
              disabled={submitting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {currentDocIndex === 0 ? 'Voltar ao cadastro' : 'Anterior'}
            </Button>

            {!isLast ? (
              <Button onClick={() => setCurrentDocIndex((i) => i + 1)}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleDocsSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {submitting ? 'Enviando...' : 'Enviar cadastro e documentos'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- FORM STEP ----------
  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Cadastro do Cliente</CardTitle>
            <CardDescription>
              {linkData.professional?.name
                ? <>Você está sendo cadastrado(a) com <strong>{linkData.professional.name}</strong>.</>
                : 'Preencha seus dados para iniciarmos o atendimento.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={personType} onValueChange={(v) => setPersonType(v as 'pf'|'pj')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pf">Pessoa Física</TabsTrigger>
                <TabsTrigger value="pj">Pessoa Jurídica</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{personType === 'pj' ? 'Nome do contato *' : 'Nome completo *'}</Label>
                <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-1.5">
                <Label>Celular *</Label>
                <Input value={form.phone} onChange={(e) => update('phone', formatPhone(e.target.value))} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>

              {personType === 'pf' ? (
                <>
                  <div className="space-y-1.5">
                    <Label>CPF *</Label>
                    <Input value={form.cpf} onChange={(e) => update('cpf', formatCpfMask(e.target.value))} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de nascimento</Label>
                    <Input type="date" value={form.birthdate} onChange={(e) => update('birthdate', e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>CNPJ *</Label>
                    <Input value={form.cnpj} onChange={(e) => update('cnpj', formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Razão social</Label>
                    <Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} placeholder="Empresa LTDA" />
                  </div>
                </>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Como nos conheceu?</Label>
                <Select value={form.referral_source} onValueChange={(v) => update('referral_source', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {REFERRAL_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-sm font-medium mb-2">Endereço</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={form.cep}
                      onChange={(e) => update('cep', formatCep(e.target.value))}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                    />
                    {cepLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Rua / Avenida</Label>
                  <Input value={form.address_street} onChange={(e) => update('address_street', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{personType === 'pj' ? 'Número do estabelecimento' : 'Número'}</Label>
                  <Input value={form.address_number} onChange={(e) => update('address_number', e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Complemento</Label>
                  <Input value={form.address_complement} onChange={(e) => update('address_complement', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input value={form.address_neighborhood} onChange={(e) => update('address_neighborhood', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={form.address_city} onChange={(e) => update('address_city', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF</Label>
                  <Select value={form.address_state} onValueChange={(v) => update('address_state', v)}>
                    <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {UF_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações {personType === 'pf' ? '(alergias, referências, etc.)' : '(informações adicionais)'}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={3}
                placeholder={personType === 'pf' ? 'Possui alguma alergia? Referências, observações...' : 'Informações adicionais sobre o estabelecimento...'}
              />
            </div>
          </CardContent>
        </Card>

        {linkData.templates.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Após salvar, você preencherá {linkData.templates.length === 1 ? '1 documento' : `${linkData.templates.length} documentos`} (
              {linkData.templates.map((t) => t.title).join(', ')}). Seus dados serão preenchidos automaticamente.
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>Seus dados são protegidos. Você não precisa criar conta nem fazer login.</span>
        </div>

        <Button className="w-full h-11" onClick={handleFormNext} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {linkData.templates.length > 0 ? 'Salvar e preencher documentos' : (submitting ? 'Enviando...' : 'Enviar cadastro')}
          {linkData.templates.length > 0 && <ChevronRight className="h-4 w-4 ml-1" />}
        </Button>
      </div>
    </div>
  );
}
