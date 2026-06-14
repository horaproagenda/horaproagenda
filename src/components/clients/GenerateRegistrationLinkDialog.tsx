import { useEffect, useMemo, useState } from 'react';
import { buildClientRegistrationUrl } from '@/lib/publicRoutes';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Link2, Copy, Check, MessageCircle, Loader2, ExternalLink, ShieldCheck, FileText, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useAuth } from '@/contexts/AuthContext';
import { WhatsappPreviewDialog } from '@/components/shared/WhatsappPreviewDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateRegistrationLinkDialog({ open, onOpenChange }: Props) {
  const { professionals } = useProfessionals();
  const { templates } = useDocumentTemplates();
  const { professionalId, isProfessional } = useCurrentProfessional();
  const { hasRole } = useAuth();
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');

  const activeProfessionals = useMemo(() => professionals.filter((p) => p.is_active), [professionals]);

  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<string>('7');
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [whatsappPreviewOpen, setWhatsappPreviewOpen] = useState(false);
  const [whatsappPreviewMessage, setWhatsappPreviewMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    // Pre-select logged-in professional when applicable
    if (isProfessional && professionalId) {
      setSelectedProfessionalId(professionalId);
    }
  }, [open, isProfessional, professionalId]);

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    if (!selectedProfessionalId) {
      toast.error('Selecione a profissional responsável.');
      return;
    }
    setLoading(true);
    try {
      const expiresAt =
        expiresInDays === 'none'
          ? null
          : new Date(Date.now() + parseInt(expiresInDays, 10) * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('client_registration_links')
        .insert({
          professional_id: selectedProfessionalId,
          template_ids: selectedTemplateIds,
          expires_at: expiresAt,
          single_use: false,
        })
        .select('token')
        .single();

      if (error) throw error;
      const url = buildClientRegistrationUrl(data.token);
      setGeneratedUrl(url);
      toast.success('Link de cadastro gerado!');
    } catch (e: any) {
      toast.error('Erro ao gerar link: ' + (e?.message || 'desconhecido'));
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
      toast.error('Erro ao copiar');
    }
  };

  const handleWhatsApp = () => {
    const msg =
      `Olá! Para iniciarmos o seu atendimento, preencha o seu cadastro pelo link abaixo (leva poucos minutos):\n\n${generatedUrl}`;
    setWhatsappPreviewMessage(msg);
    setWhatsappPreviewOpen(true);
  };

  const handleReset = () => {
    setGeneratedUrl('');
    setCopied(false);
    setSelectedTemplateIds([]);
    if (!isProfessional) setSelectedProfessionalId('');
    setExpiresInDays('7');
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Cadastro do Cliente
          </DialogTitle>
          <DialogDescription>
            Gere um link para o cliente preencher seu próprio cadastro. O cliente será vinculado à profissional escolhida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!generatedUrl ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <UserCog className="h-3.5 w-3.5" />
                  Profissional responsável *
                </Label>
                {isProfessional && !isAdminOrReceptionist ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="text-sm font-medium">
                      {activeProfessionals.find((p) => p.id === professionalId)?.name || 'Você'}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">Fixo</Badge>
                  </div>
                ) : (
                  <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione a profissional..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProfessionals.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Documentos para o cliente preencher (opcional)
                </Label>
                <div className="rounded-md border max-h-44 overflow-y-auto divide-y">
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3">Nenhum modelo de documento disponível.</p>
                  )}
                  {templates.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={selectedTemplateIds.includes(t.id)}
                        onCheckedChange={() => toggleTemplate(t.id)}
                      />
                      <span className="text-sm">{t.title}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Os documentos selecionados serão preenchidos pelo cliente no mesmo formulário e ficarão salvos no perfil dele.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Validade do link</Label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
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
                <span>
                  CPF/CNPJ, telefone e e-mail são validados automaticamente. Clientes duplicados (mesmo CPF ou telefone) são bloqueados.
                </span>
              </div>

              <Separator />
              <Button className="w-full gap-2" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {loading ? 'Gerando...' : 'Gerar link de cadastro'}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-primary">Link gerado ✓</Label>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="text-xs font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2 w-full" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  Copiar link
                </Button>
                <Button variant="outline" className="gap-2 w-full" onClick={handleWhatsApp}>
                  <MessageCircle className="h-4 w-4" />
                  Compartilhar no WhatsApp
                </Button>
                <Button variant="ghost" className="gap-2 w-full sm:col-span-2" onClick={() => window.open(generatedUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                  Abrir link
                </Button>
              </div>

              <Separator />
              <Button variant="secondary" className="w-full" onClick={handleReset}>
                Gerar outro link
              </Button>
            </>
          )}
        </div>
      </DialogContent>
      <WhatsappPreviewDialog
        open={whatsappPreviewOpen}
        onOpenChange={setWhatsappPreviewOpen}
        initialMessage={whatsappPreviewMessage}
        title="Enviar link de cadastro no WhatsApp"
        description="Revise e edite a mensagem antes de enviar para o cliente."
      />
    </Dialog>
  );
}
