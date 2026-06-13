import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Link2,
  Copy,
  Check,
  MessageCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  User,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useDocumentFillLinks } from '@/hooks/useDocumentFillLinks';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentPrefillSnapshot } from '@/lib/documentTemplateFields';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';

const formatBRL = (n: number | string | null | undefined): string => {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? '0').replace(',', '.'));
  if (!Number.isFinite(v)) return '';
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const buildClientAddress = (c: any): string => {
  if (!c) return '';
  const parts = [
    [c.address_street, c.address_number].filter(Boolean).join(', '),
    c.address_complement,
    c.address_neighborhood,
    [c.address_city, c.address_state].filter(Boolean).join('/'),
    c.cep,
  ].filter(Boolean);
  return parts.join(' - ');
};

interface GenerateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    id: string;
    title: string;
  } | null;
  preSelectedClientId?: string;
  preSelectedClient?: {
    id: string;
    name: string;
    cpf?: string | null;
    phone?: string | null;
    birthdate?: string | null;
  };
}

export function GenerateLinkDialog({ open, onOpenChange, template, preSelectedClientId, preSelectedClient }: GenerateLinkDialogProps) {
  const { clients } = useClients();
  const { professionals } = useProfessionals();
  const { createLink } = useDocumentFillLinks();

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>('7');
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedDescription, setCopiedDescription] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<any | null>(null);

  const activeProfessionals = useMemo(() => professionals.filter(p => p.is_active), [professionals]);
  const activeClients = useMemo(() => clients.filter(c => c.is_active), [clients]);
  const selectedClient = activeClients.find(c => c.id === selectedClientId)
    || (preSelectedClient?.id === selectedClientId ? preSelectedClient : undefined);
  const selectedProfessional = activeProfessionals.find(p => p.id === selectedProfessionalId);

  // When opened from a client profile, the client is locked.
  const isClientLocked = !!preSelectedClientId;

  useEffect(() => {
    if (open && preSelectedClientId) {
      setSelectedClientId(preSelectedClientId);
    }
  }, [open, preSelectedClientId]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('business_settings')
      .select('*')
      .maybeSingle()
      .then(({ data }) => setBusinessSettings(data));
  }, [open]);

  const buildPrefillSnapshot = (): DocumentPrefillSnapshot => {
    const c: any = selectedClient;
    const biz: any = businessSettings;
    const today = new Date();
    const todayStr = today.toLocaleDateString('pt-BR');
    return {
      client: c
        ? {
            id: c.id,
            name: c.name,
            birthdate: c.birthdate,
            cpf: c.cpf,
            phone: c.phone,
          }
        : undefined,
      professional: selectedProfessional
        ? {
            id: selectedProfessional.id,
            name: selectedProfessional.name,
          }
        : undefined,
      formData: {
        data: todayStr,
        data_atual: todayStr,
        ...(c?.name ? { cliente: c.name, nome_cliente: c.name, nome: c.name } : {}),
        ...(c?.cpf ? { cpf: c.cpf } : {}),
        ...(c?.phone ? { telefone: c.phone } : {}),
        ...(c?.email ? { email: c.email } : {}),
        ...(c?.address_city ? { cidade: c.address_city } : {}),
        ...(c ? { endereco: buildClientAddress(c), endereco_cliente: buildClientAddress(c) } : {}),
        ...(selectedProfessional?.name ? { profissional: selectedProfessional.name, nome_profissional: selectedProfessional.name } : {}),
        ...(biz?.clinic_name ? { nome_clinica: biz.clinic_name } : {}),
        ...(biz?.clinic_address ? { endereco_clinica: biz.clinic_address } : {}),
        ...(biz?.clinic_phone ? { telefone_clinica: biz.clinic_phone } : {}),
        ...(biz?.clinic_email ? { email_clinica: biz.clinic_email } : {}),
        ...(biz?.clinic_cnpj ? { cnpj_clinica: biz.clinic_cnpj } : {}),
      },
    };
  };

  const handleGenerate = async () => {
    if (!template) return;

    if (!selectedClientId) {
      toast.error('Selecione um cliente para gerar o link com autenticação por CPF.');
      return;
    }
    if (!selectedClient?.cpf) {
      toast.error('O cliente selecionado não possui CPF cadastrado. Edite o perfil do cliente e adicione o CPF antes de gerar o link.');
      return;
    }

    setLoading(true);
    try {
      const normalizedExpiresInDays = expiresInDays === 'none' ? undefined : parseInt(expiresInDays, 10);
      const result = await createLink(template.id, {
        clientId: selectedClientId || undefined,
        clientName: selectedClient?.name,
        documentTitle: template.title,
        professionalId: selectedProfessionalId || undefined,
        expiresInDays: Number.isFinite(normalizedExpiresInDays) ? normalizedExpiresInDays : undefined,
        prefillSnapshot: buildPrefillSnapshot(),
      });

      if (result) {
        setGeneratedUrl(result.url);
      }
    } finally {
      setLoading(false);
    }
  };

  // Friendly description shown above the raw URL — and used by share actions.
  const linkDescription = useMemo(() => {
    const lines: string[] = [
      `📄 Documento: ${template?.title ?? ''}`,
      `👤 Cliente: ${selectedClient?.name ?? ''}`,
      '',
      'Olá!',
      '',
      `Você recebeu o documento "${template?.title ?? ''}" para preenchimento e assinatura.`,
      '',
      'Como acessar:',
      `1. Clique no link abaixo ou copie e cole no navegador do seu celular/computador.`,
      '2. Informe o CPF cadastrado para acessar com segurança.',
      '3. Preencha todos os campos solicitados.',
      '4. No final, confirme e assine digitalmente.',
      '',
      `🔗 Link: ${generatedUrl}`,
      '',
      '⚠️ O link é único e protegido. Não compartilhe com outras pessoas.',
    ];
    return lines.join('\n');
  }, [template?.title, selectedClient?.name, generatedUrl]);

  const handleCopy = async (textOverride?: string, isDescription = false) => {
    try {
      await navigator.clipboard.writeText(textOverride ?? generatedUrl);
      if (isDescription) {
        setCopiedDescription(true);
        toast.success('Mensagem copiada!');
        setTimeout(() => setCopiedDescription(false), 2000);
      } else {
        setCopied(true);
        toast.success('Link copiado!');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleWhatsApp = () => {
    const firstName = selectedClient?.name ? selectedClient.name.split(' ')[0] : '';
    const lines: string[] = [
      `Olá${firstName ? ` ${firstName}` : ''}! 👋`,
      '',
      `Você recebeu o documento *"${template?.title ?? ''}"* para preenchimento e assinatura. ✍️`,
      '',
      '*Como acessar:*',
      '1️⃣ Clique no link abaixo ou copie e cole no navegador do seu celular/computador.',
      '2️⃣ Informe o CPF cadastrado para acessar com segurança.',
      '3️⃣ Preencha todos os campos solicitados.',
      '4️⃣ No final, confirme e assine digitalmente.',
      '',
      `🔗 Link: ${generatedUrl}`,
      '',
      '⚠️ O link é único e protegido. Não compartilhe com outras pessoas.',
    ];
    const message = lines.join('\n');

    if (selectedClient?.phone) {
      openWhatsappWithMessage(selectedClient.phone, message);
    } else {
      openWhatsappWithMessage('', message);
    }
  };

  const handleReset = () => {
    setGeneratedUrl('');
    setSelectedClientId(preSelectedClientId || '');
    setSelectedProfessionalId('');
    setExpiresInDays('7');
    setCopied(false);
    setCopiedDescription(false);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Enviar por Link
          </DialogTitle>
          <DialogDescription>
            Gere um link seguro para o cliente preencher e assinar o documento "{template.title}". O cliente precisará informar o CPF cadastrado para acessar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!generatedUrl ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Cliente *</Label>
                {isClientLocked && selectedClient ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{selectedClient.name}</span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">Fixo</Badge>
                  </div>
                ) : (
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeClients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}{!client.cpf ? ' (sem CPF)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedClient && !selectedClient.cpf && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Este cliente não possui CPF cadastrado. Cadastre o CPF no perfil para liberar a autenticação.</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  O nome do cliente é fixo conforme o cadastro, evitando erros.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Profissional Responsável (opcional)</Label>
                <Select value={selectedProfessionalId || 'none'} onValueChange={(value) => setSelectedProfessionalId(value === 'none' ? '' : value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione o profissional..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {activeProfessionals.map(professional => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Validade do Link</Label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 dia</SelectItem>
                    <SelectItem value="3">3 dias</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="none">Sem validade</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>O acesso ao documento é protegido: o cliente precisa digitar o CPF cadastrado para abrir, preencher e assinar.</span>
              </div>

              <Separator />

              <Button className="w-full gap-2" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {loading ? 'Gerando...' : 'Gerar Link Seguro'}
              </Button>
            </>
          ) : (
            <>
              {/* Friendly description */}
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{template.title}</span>
                </div>
                {selectedClient && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedClient.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Acesso protegido por CPF</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-primary">Link Gerado ✓</Label>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="text-xs font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy()} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Universal copy actions: visible on mobile AND desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button variant="outline" className="gap-2 w-full" onClick={() => handleCopy(linkDescription, true)}>
                  {copiedDescription ? <Check className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4" />}
                  Copiar Mensagem
                </Button>
                <Button variant="outline" className="gap-2 w-full" onClick={handleWhatsApp}>
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
                <Button variant="ghost" className="gap-2 w-full" onClick={() => window.open(generatedUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                  Abrir Link
                </Button>
              </div>

              <Separator />

              <Button variant="secondary" className="w-full" onClick={handleReset}>
                Gerar Novo Link
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
