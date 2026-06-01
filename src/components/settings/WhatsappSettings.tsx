import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, QrCode, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function WhatsappSettings() {
  const { professionals } = useProfessionals();
  const {
    connectionStatus,
    checkConnection,
    getQRCode,
    qrCode,
    pairingCode,
    isLoading,
    isLoadingQR,
  } = useWhatsapp();

  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Teste do AgendaLume ✅ — se você recebeu, o WhatsApp conectado está funcionando.');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    void checkConnection(selectedProfessionalId || undefined);
  }, [checkConnection, selectedProfessionalId]);

  const handleGenerateQr = async () => {
    await getQRCode(selectedProfessionalId || undefined);
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Informe um número para teste');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: testPhone.trim(),
          message: testMessage,
          professional_id: selectedProfessionalId || undefined,
          test: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha no envio');
      toast.success(data?.instance ? `Mensagem enviada pela instância ${data.instance}` : 'Mensagem de teste enviada!');
      await checkConnection(selectedProfessionalId || undefined);
    } catch (e: any) {
      toast.error('Erro ao enviar: ' + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const connected = connectionStatus?.connected === true;
  const configured = connectionStatus?.configured !== false;
  const selectedProfessional = professionals.find((p) => p.id === selectedProfessionalId);
  const selectedInstance = selectedProfessionalId
    ? ((selectedProfessional as any)?.whatsapp_from_number || selectedProfessional?.name || selectedProfessionalId)
    : (connectionStatus?.instance || 'padrão da clínica');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp conectado</CardTitle>
              <CardDescription>
                Envio direto pelo WhatsApp conectado via QR Code, sem abrir api.whatsapp.com, wa.me ou WhatsApp Web.
              </CardDescription>
            </div>
          </div>
          {connected ? (
            <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Conectado</Badge>
          ) : configured ? (
            <Badge variant="outline">Aguardando QR Code</Badge>
          ) : (
            <Badge variant="destructive">Não configurado</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <Alert variant={connected ? 'default' : configured ? 'default' : 'destructive'}>
          {connected ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{connected ? 'Conexão ativa' : 'Conectar WhatsApp'}</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <p>{connectionStatus?.message || connectionStatus?.error || 'Gere o QR Code e leia com o WhatsApp do aparelho que enviará as mensagens.'}</p>
            <p>Instância atual: <span className="font-medium">{selectedInstance}</span></p>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="whatsapp-professional">Profissional / instância</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select
              id="whatsapp-professional"
              value={selectedProfessionalId}
              onChange={(e) => setSelectedProfessionalId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Padrão da clínica</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button variant="outline" onClick={() => checkConnection(selectedProfessionalId || undefined)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Verificar
            </Button>
            <Button onClick={handleGenerateQr} disabled={isLoadingQR}>
              {isLoadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              Gerar QR Code
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Para instância por profissional, preencha o nome da instância no campo WhatsApp do cadastro do profissional.
          </p>
        </div>

        {(qrCode || pairingCode) && (
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[180px_1fr]">
            {qrCode && (
              <img
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code para conectar WhatsApp"
                className="h-44 w-44 rounded-md border bg-white p-2"
              />
            )}
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Abra o WhatsApp no celular e leia o QR Code.</p>
              <p>WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>
              {pairingCode && <p>Código de pareamento: <span className="font-mono text-foreground">{pairingCode}</span></p>}
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Enviar mensagem de teste</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="+5511988887777"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              autoComplete="off"
            />
            <Button onClick={handleSendTest} disabled={isSending || !connected}>
              {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar teste
            </Button>
          </div>
          <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          {!connected && (
            <p className="text-[11px] text-destructive">Conecte o WhatsApp por QR Code antes de testar.</p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Instâncias por profissional</h4>
          <div className="rounded-lg border divide-y">
            {professionals.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Nenhum profissional cadastrado.</div>
            )}
            {professionals.map((p) => {
              const instance = ((p as any).whatsapp_from_number || '').trim();
              return (
                <div key={p.id} className="flex items-center justify-between p-3">
                  <div className="text-sm font-medium">{p.name}</div>
                  {instance
                    ? <Badge variant="secondary" className="font-mono text-[11px]">{instance}</Badge>
                    : <Badge variant="outline" className="text-[11px]">usa padrão</Badge>}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}