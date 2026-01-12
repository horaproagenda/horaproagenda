import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, RefreshCw, QrCode, Smartphone, Copy, Check } from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';

export function WhatsappSettings() {
  const { 
    isLoading, 
    connectionStatus, 
    checkConnection, 
    qrCode, 
    pairingCode, 
    isLoadingQR, 
    getQRCode,
    clearQRCode 
  } = useWhatsapp();
  
  const [showQRCode, setShowQRCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const qrExpiryRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Poll for connection status when QR code is showing
  useEffect(() => {
    if (showQRCode && qrCode && !connectionStatus?.connected) {
      pollingRef.current = setInterval(async () => {
        const status = await checkConnection();
        if (status?.connected) {
          setShowQRCode(false);
          clearQRCode();
          toast.success('WhatsApp conectado com sucesso!');
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (qrExpiryRef.current) clearTimeout(qrExpiryRef.current);
        }
      }, 3000);

      // QR code expires after 60 seconds
      qrExpiryRef.current = setTimeout(() => {
        clearQRCode();
        toast.info('QR Code expirou. Clique para gerar um novo.');
      }, 60000);

      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (qrExpiryRef.current) clearTimeout(qrExpiryRef.current);
      };
    }
  }, [showQRCode, qrCode, connectionStatus?.connected, checkConnection, clearQRCode]);

  // Close QR code view when connected
  useEffect(() => {
    if (connectionStatus?.connected && showQRCode) {
      setShowQRCode(false);
      clearQRCode();
    }
  }, [connectionStatus?.connected, showQRCode, clearQRCode]);

  const handleConnectWhatsApp = async () => {
    setShowQRCode(true);
    await getQRCode();
  };

  const handleRefreshQRCode = async () => {
    await getQRCode();
  };

  const handleCopyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadge = () => {
    if (isLoading) {
      return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Verificando...</Badge>;
    }
    if (!connectionStatus?.configured) {
      return <Badge variant="outline">Não configurado</Badge>;
    }
    if (connectionStatus?.connected) {
      return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Conectado</Badge>;
    }
    return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp</CardTitle>
              <CardDescription>
                Integração com Evolution API para envio de mensagens
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Not Configured Alert */}
        {!connectionStatus?.configured && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuração necessária</AlertTitle>
            <AlertDescription>
              Para usar a integração com WhatsApp, você precisa configurar a Evolution API. 
              Solicite ao administrador do sistema para configurar as seguintes variáveis de ambiente:
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>EVOLUTION_API_URL - URL da sua instância Evolution API</li>
                <li>EVOLUTION_API_KEY - Chave de API</li>
                <li>EVOLUTION_INSTANCE_NAME - Nome da instância</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Disconnected Alert with Connect Button */}
        {connectionStatus?.configured && !connectionStatus?.connected && !showQRCode && (
          <>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>⚠️ WhatsApp desconectado</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  A instância do WhatsApp não está conectada. O envio de mensagens automáticas 
                  está <strong>temporariamente indisponível</strong>.
                </p>
                <div className="bg-destructive/10 p-3 rounded-md mt-2 space-y-1">
                  <p className="font-medium text-sm">Possíveis causas:</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    <li>O WhatsApp foi desconectado do aparelho</li>
                    <li>A sessão expirou e precisa ser reconectada</li>
                    <li>Problemas de conexão com a Evolution API</li>
                  </ul>
                </div>
                {connectionStatus.instance && (
                  <p className="text-xs mt-1 opacity-80">Instância: {connectionStatus.instance}</p>
                )}
                {connectionStatus.error && (
                  <div className="mt-2 p-2 bg-destructive/20 rounded text-xs font-mono">
                    Erro: {connectionStatus.error}
                  </div>
                )}
              </AlertDescription>
            </Alert>
            
            <div className="flex flex-col items-center gap-4 py-4">
              <Button 
                size="lg" 
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                onClick={handleConnectWhatsApp}
                disabled={isLoadingQR}
              >
                {isLoadingQR ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <QrCode className="h-5 w-5" />
                )}
                Conectar WhatsApp
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Clique para gerar o QR Code e conectar seu WhatsApp
              </p>
            </div>
          </>
        )}

        {/* QR Code Display */}
        {connectionStatus?.configured && showQRCode && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Conectar WhatsApp
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setShowQRCode(false);
                  clearQRCode();
                }}
              >
                Cancelar
              </Button>
            </div>
            
            <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-muted/30">
              {isLoadingQR ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-green-500" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                </div>
              ) : qrCode ? (
                <>
                  <div className="bg-white p-4 rounded-lg shadow-lg">
                    <img 
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="WhatsApp QR Code" 
                      className="w-64 h-64"
                    />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="font-medium">Escaneie o QR Code com seu WhatsApp</p>
                    <ol className="text-sm text-muted-foreground space-y-1 text-left">
                      <li>1. Abra o WhatsApp no seu celular</li>
                      <li>2. Toque em <strong>Configurações</strong> → <strong>Dispositivos Conectados</strong></li>
                      <li>3. Toque em <strong>Conectar um dispositivo</strong></li>
                      <li>4. Aponte a câmera para este QR Code</li>
                    </ol>
                  </div>

                  {pairingCode && (
                    <div className="w-full p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1 text-center">
                        Ou use o código de pareamento:
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <code className="text-lg font-mono font-bold tracking-wider">
                          {pairingCode}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleCopyPairingCode}
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRefreshQRCode}
                      disabled={isLoadingQR}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingQR ? 'animate-spin' : ''}`} />
                      Atualizar QR Code
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    O QR Code expira em 60 segundos. A conexão será detectada automaticamente.
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                  <p className="text-sm text-muted-foreground">Erro ao gerar QR Code</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefreshQRCode}
                    disabled={isLoadingQR}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connected State */}
        {connectionStatus?.configured && connectionStatus?.connected && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">WhatsApp conectado e funcionando</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Instância: {connectionStatus.instance}
            </p>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Verificar Conexão</h4>
            <p className="text-sm text-muted-foreground">
              Atualizar o status da conexão com o WhatsApp
            </p>
          </div>
          <Button variant="outline" onClick={checkConnection} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Verificar
          </Button>
        </div>

        <Separator />

        <div className="text-sm text-muted-foreground">
          <h4 className="font-medium text-foreground mb-2">Funcionalidades disponíveis:</h4>
          <ul className="space-y-1">
            <li>✅ Envio de lembretes de agendamento</li>
            <li>✅ Mensagens de aniversário</li>
            <li>✅ Confirmações de pagamento</li>
            <li>✅ Notificações personalizadas</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
