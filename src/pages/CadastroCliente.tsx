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
import { Loader2, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';
import { validateCNPJ } from '@/lib/validationSchemas';
import { fetchAddressByCep, formatCep } from '@/lib/viacep';
import { htmlToPlainText } from '@/lib/documentTemplateFields';

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

export default function CadastroCliente() {
  const { token } = useParams<{ token: string }>();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', cpf: '', cnpj: '', company_name: '',
    birthdate: '', referral_source: '', notes: '',
    cep: '', address_street: '', address_number: '', address_complement: '',
    address_neighborhood: '', address_city: '', address_state: '',
  });
  const [docOverrides, setDocOverrides] = useState<Record<string, string>>({});
  const [signedBy, setSignedBy] = useState<string>('');

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

  const fillTemplate = (raw: string): string => {
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
    const map: Record<string, string> = {
      nome: signedBy || form.name || '',
      cpf: form.cpf || '',
      cnpj: form.cnpj || '',
      telefone: form.phone || '',
      celular: form.phone || '',
      email: form.email || '',
      'e-mail': form.email || '',
      nascimento: nascimentoBR,
      'data_nascimento': nascimentoBR,
      idade: calcAge(form.birthdate),
      data: today,
      'data_atual': today,
      endereco: endereco,
      'endereço': endereco,
      cep: form.cep || '',
      cidade: form.address_city || '',
      uf: form.address_state || '',
      'razao_social': form.company_name || '',
    };
    return raw.replace(/\{([^{}]+)\}/g, (_m, key) => {
      const k = String(key).trim().toLowerCase();
      const v = map[k];
      return v !== undefined && v !== '' ? v : `{${key}}`;
    });
  };

  const templateBase = useMemo(() => {
    const out: Record<string, string> = {};
    (linkData?.templates || []).forEach((t) => { out[t.id] = htmlToPlainText(t.content || ''); });
    return out;
  }, [linkData]);

  const getDocValue = (id: string) =>
    docOverrides[id] !== undefined ? docOverrides[id] : fillTemplate(templateBase[id] || '');

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

  const validate = (): string | null => {
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
    if (linkData?.templates?.length && !signedBy.trim()) return 'Informe seu nome para assinar os documentos.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSubmitting(true);
    try {
      const filled_documents = (linkData?.templates || []).map((t) => ({
        template_id: t.id,
        content: getDocValue(t.id),
        variables: { nome: signedBy || form.name, data: new Date().toLocaleDateString('pt-BR') },
        signed_by: signedBy || form.name,
      }));

      const url = `${import.meta.env.VITE_SUPABASE_URL || 'https://nsgcllrbswodjoadybsj.supabase.co'}/functions/v1/submit-client-registration`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          person_type: personType,
          ...form,
          filled_documents,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        const msg = result.error || result.errors?.[0]?.message || 'Erro ao enviar cadastro';
        throw new Error(msg);
      }
      setSuccess(true);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar cadastro');
    } finally { setSubmitting(false); }
  };

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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <CardTitle className="mt-2">Cadastro enviado!</CardTitle>
            <CardDescription>
              Seus dados foram registrados com sucesso. {linkData.professional?.name ? `${linkData.professional.name} entrará em contato em breve.` : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentos para preencher e assinar</CardTitle>
              <CardDescription>Leia, complete o que for necessário e confirme abaixo. Os documentos serão salvos no seu perfil.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkData.templates.map((t) => (
                <div key={t.id} className="space-y-2">
                  <h4 className="text-sm font-medium">{t.title}</h4>
                  <Textarea
                    rows={10}
                    value={getDocValue(t.id)}
                    onChange={(e) => setDocOverrides((p) => ({ ...p, [t.id]: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Assinatura (digite seu nome completo) *</Label>
                <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Nome completo para assinatura" />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>Seus dados são protegidos. CPF, telefone e e-mail são validados. Você só verá esta tela uma vez.</span>
        </div>

        <Button className="w-full h-11" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? 'Enviando...' : 'Enviar cadastro'}
        </Button>
      </div>
    </div>
  );
}
