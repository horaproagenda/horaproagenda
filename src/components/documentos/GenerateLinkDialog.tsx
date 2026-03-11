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
import {
  Link2,
  Copy,
  Check,
  MessageCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useDocumentFillLinks } from '@/hooks/useDocumentFillLinks';
import type { DocumentPrefillSnapshot } from '@/lib/documentTemplateFields';

interface GenerateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    id: string;
    title: string;
  } | null;
  preSelectedClientId?: string;
}

export function GenerateLinkDialog({ open, onOpenChange, template, preSelectedClientId }: GenerateLinkDialogProps) {
  const { clients } = useClients();
  const { professionals } = useProfessionals();
  const { createLink } = useDocumentFillLinks();

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>('7');
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeProfessionals = useMemo(() => professionals.filter(p => p.is_active), [professionals]);
  const activeClients = useMemo(() => clients.filter(c => c.is_active), [clients]);
  const selectedClient = activeClients.find(c => c.id === selectedClientId);
  const selectedProfessional = activeProfessionals.find(p => p.id === selectedProfessionalId);

  useEffect(() => {
    if (open && preSelectedClientId) {
      setSelectedClientId(preSelectedClientId);
    }
  }, [open, preSelectedClientId]);

  const buildPrefillSnapshot = (): DocumentPrefillSnapshot => ({
    client: selectedClient
      ? {
          id: selectedClient.id,
          name: selectedClient.name,
          birthdate: selectedClient.birthdate,
          cpf: selectedClient.cpf,
          phone: selectedClient.phone,
        }
      : undefined,
    professional: selectedProfessional
      ? {
          id: selectedProfessional.id,
          name: selectedProfessional.name,
        }
      : undefined,
    formData: {
      ...(selectedClient?.name ? { cliente: selectedClient.name, nome_cliente: selectedClient.name, nome: selectedClient.name } : {}),
      ...(selectedClient?.cpf ? { cpf: selectedClient.cpf } : {}),
      ...(selectedClient?.phone ? { telefone: selectedClient.phone } : {}),
      ...(selectedProfessional?.name ? { profissional: selectedProfessional.name, nome_profissional: selectedProfessional.name } : {}),
    },
  });

  const handleGenerate = async () => {
    if (!template) return;

    setLoading(true);
    try {
      const normalizedExpiresInDays = expiresInDays === 'none' ? undefined : parseInt(expiresInDays, 10);
      const result = await createLink(template.id, {
        clientId: selectedClientId || undefined,
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar link');
    }
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `Olá${selectedClient ? ` ${selectedClient.name.split(' ')[0]}` : ''}! ` +
      `Por favor, preencha o documento "${template?.title}" através deste link: ${generatedUrl}`
    );

    if (selectedClient?.phone) {
      const phone = selectedClient.phone.replace(/\D/g, '');
      window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${message}`, '_blank');
    }
  };

  const handleReset = () => {
    setGeneratedUrl('');
    setSelectedClientId(preSelectedClientId || '');
    setSelectedProfessionalId('');
    setExpiresInDays('7');
    setCopied(false);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Enviar por Link
          </DialogTitle>
          <DialogDescription>
            Gere um link para o cliente preencher o documento "{template.title}" online. Copie o link e envie manualmente por SMS, e-mail ou mensagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!generatedUrl ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Cliente</Label>
                <Select value={selectedClientId || 'none'} onValueChange={(value) => setSelectedClientId(value === 'none' ? '' : value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (link genérico)</SelectItem>
                    {activeClients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Dados do cliente serão preservados no link para evitar tela branca e garantir o preenchimento automático.
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

              <Separator />

              <Button className="w-full gap-2" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {loading ? 'Gerando...' : 'Gerar Link'}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-primary">Link Gerado ✓</Label>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="text-xs font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copie o link acima e envie manualmente para o cliente por SMS, e-mail, WhatsApp ou qualquer outra forma.
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="gap-2" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  Copiar Link
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleWhatsApp}>
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
              </div>

              <Button variant="ghost" className="w-full gap-2" onClick={() => window.open(generatedUrl, '_blank')}>
                <ExternalLink className="h-4 w-4" />
                Abrir Link
              </Button>

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
