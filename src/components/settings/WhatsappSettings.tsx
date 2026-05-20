import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, Send, ShieldCheck, ExternalLink } from 'lucide-react';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function WhatsappSettings() {
  const { professionals } = useProfessionals();
  const { settings, updateSettings } = useBusinessSettings();

  const [fromNumber, setFromNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { ok: boolean; message?: string }>(null);

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Teste do AgendaLume ✅ — se você recebeu, a integração WhatsApp está funcionando.');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (settings?.twilio_from_number != null) setFromNumber(settings.twilio_from_number || '');
  }, [settings?.twilio_from_number]);

  const handleSaveFrom = async () => {
    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({ twilio_from_number: fromNumber.trim() || null } as any);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-check-connection', {
        body: { provider: 'twilio' },
      });
      if (error) throw error;
      const ok = data?.connected === true || data?.outcome === 'verified' || data?.outcome === 'skipped';
      setVerifyResult({ ok, message: data?.message || data?.error || (ok ? 'Conexão Twilio validada' : 'Falha na validação') });
      ok ? toast.success('Twilio conectado') : toast.error(data?.error || 'Falha ao validar Twilio');
    } catch (e: any) {
      setVerifyResult({ ok: false, message: e.message });
      toast.error('Erro: ' + e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) { toast.error('Informe um número para teste'); return; }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: { phone: testPhone.trim(), message: testMessage, test: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha no envio');
      toast.success('Mensagem de teste enviada!');
    } catch (e: any) {
      toast.error('Erro ao enviar: ' + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const hasFrom = (settings?.twilio_from_number || '').trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp (via Twilio)</CardTitle>
              <CardDescription>
                Envio automático de lembretes, confirmações, pós-atendimento e aniversários pelo seu número WhatsApp Business.
              </CardDescription>
            </div>
          </div>
          {hasFrom
            ? <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Configurado</Badge>
            : <Badge variant="outline">Falta configurar remetente</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Como funciona</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <p>1. Sua conta Twilio já está conectada ao app (conector oficial Lovable).</p>
            <p>2. Aprove um número WhatsApp Business no console da Twilio e cole abaixo no formato <code>+5511999999999</code>.</p>
            <p>3. Cada profissional pode ter seu próprio número (editar no cadastro do profissional). Sem isso, usa o número padrão da clínica.</p>
            <p>4. O sistema dispara as mensagens automaticamente respeitando o horário configurado nos templates, sem repetir.</p>
            <a href="https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline text-primary">
              Abrir console Twilio WhatsApp <ExternalLink className="h-3 w-3" />
            </a>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="twilio-from">Número remetente padrão (WhatsApp Business)</Label>
          <div className="flex gap-2">
            <Input
              id="twilio-from"
              placeholder="+5511999999999"
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              autoComplete="off"
            />
            <Button onClick={handleSaveFrom} disabled={isSaving || fromNumber === (settings?.twilio_from_number || '')}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Formato internacional, com <code>+</code> e DDI (Brasil = 55). Esse será o remetente quando o profissional não tiver número próprio.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Verificar conexão Twilio</h4>
              <p className="text-xs text-muted-foreground">Confirma se as credenciais Twilio estão ativas.</p>
            </div>
            <Button variant="outline" onClick={handleVerify} disabled={isVerifying}>
              {isVerifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Verificar
            </Button>
          </div>
          {verifyResult && (
            <Alert variant={verifyResult.ok ? 'default' : 'destructive'}>
              {verifyResult.ok ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{verifyResult.ok ? 'Conexão OK' : 'Falha'}</AlertTitle>
              <AlertDescription className="text-xs">{verifyResult.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Enviar mensagem de teste</h4>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <Input
              placeholder="+5511988887777"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              autoComplete="off"
            />
            <Button onClick={handleSendTest} disabled={isSending || !hasFrom}>
              {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar teste
            </Button>
          </div>
          <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          {!hasFrom && (
            <p className="text-[11px] text-destructive">Configure o número remetente antes de testar.</p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Números por profissional</h4>
          <p className="text-xs text-muted-foreground">
            Edite o número WhatsApp de cada profissional no cadastro dele (Cadastros → Profissionais → Editar).
          </p>
          <div className="rounded-lg border divide-y">
            {professionals.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Nenhum profissional cadastrado.</div>
            )}
            {professionals.map((p) => {
              const num = ((p as any).whatsapp_from_number || '').trim();
              return (
                <div key={p.id} className="flex items-center justify-between p-3">
                  <div className="text-sm font-medium">{p.name}</div>
                  {num
                    ? <Badge variant="secondary" className="font-mono text-[11px]">{num}</Badge>
                    : <Badge variant="outline" className="text-[11px]">usa número padrão</Badge>}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
