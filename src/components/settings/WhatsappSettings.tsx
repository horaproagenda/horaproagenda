import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, RefreshCw, Settings } from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function WhatsappSettings() {
  const { isLoading, connectionStatus, checkConnection } = useWhatsapp();
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

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

        {connectionStatus?.configured && !connectionStatus?.connected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>WhatsApp desconectado</AlertTitle>
            <AlertDescription>
              A instância do WhatsApp não está conectada. Acesse o painel da Evolution API 
              para escanear o QR Code e conectar seu número.
              {connectionStatus.instance && (
                <p className="mt-1 text-sm">Instância: {connectionStatus.instance}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

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
