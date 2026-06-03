import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';

export function WhatsappSettings() {
  const {
    connectionStatus,
    checkConnection,
    getQRCode,
    qrCode,
    pairingCode,
    isLoading,
    isLoadingQR,
  } = useWhatsapp();

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  const handleGenerateQr = async () => {
    await getQRCode();
  };

  const connected = connectionStatus?.connected === true;
  const configured = connectionStatus?.configured !== false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp (UltraMsg)</CardTitle>
              <CardDescription>
                Envio direto pelo WhatsApp conectado via UltraMsg, sem abrir api.whatsapp.com, wa.me ou WhatsApp Web.
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
        <Alert variant={connected || configured ? 'default' : 'destructive'}>
          {connected ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{connected ? 'Conexão ativa' : 'Conectar WhatsApp'}</AlertTitle>
          <AlertDescription className="text-xs">
            {connected
              ? 'Seu WhatsApp está autenticado. As mensagens automáticas (lembretes, confirmações, follow-ups, aniversários, cobranças e alertas de estoque) serão enviadas respeitando a janela de horário configurada em cada template.'
              : (connectionStatus?.message || connectionStatus?.error || 'Gere o QR Code e leia com o WhatsApp do aparelho que enviará as mensagens.')}
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => checkConnection()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Verificar conexão
          </Button>
          {!connected && (
            <Button onClick={handleGenerateQr} disabled={isLoadingQR}>
              {isLoadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              Gerar QR Code
            </Button>
          )}
        </div>

        {!connected && (qrCode || pairingCode) && (
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
      </CardContent>
    </Card>
  );
}

