import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, RefreshCw, QrCode, Smartphone, Copy, Check, ShieldCheck, KeyRound } from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { useProfessionals } from '@/hooks/useProfessionals';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const { professionals } = useProfessionals();
  
  const [showQRCode, setShowQRCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedProfId, setSelectedProfId] = useState<string>('clinic');
  const [testKey, setTestKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    ok: boolean; stage?: string; status?: number; message?: string; error?: string;
    formatHints?: string[]; instances_count?: number; instance_name?: string;
    instance_exists?: boolean; evolution_response?: string;
  }>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profId = selectedProfId === 'clinic' ? undefined : selectedProfId;

  useEffect(() => {
    checkConnection(profId);
  }, [checkConnection, profId]);

  useEffect(() => {
    if (showQRCode && qrCode && !connectionStatus?.connected) {
      pollingRef.current = setInterval(async () => {
        const status = await checkConnection(profId);
        if (status?.connected) {
          setShowQRCode(false);
          clearQRCode();
          toast.success('WhatsApp conectado com sucesso!');
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (qrExpiryRef.current) clearTimeout(qrExpiryRef.current);
        }
      }, 3000);

      qrExpiryRef.current = setTimeout(() => {
        clearQRCode();
        toast.info('QR Code expirou. Clique para gerar um novo.');
      }, 60000);

      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (qrExpiryRef.current) clearTimeout(qrExpiryRef.current);
      };
    }
  }, [showQRCode, qrCode, connectionStatus?.connected, checkConnection, clearQRCode, profId]);

  useEffect(() => {
    if (connectionStatus?.connected && showQRCode) {
      setShowQRCode(false);
      clearQRCode();
    }
  }, [connectionStatus?.connected, showQRCode, clearQRCode]);

  const handleConnectWhatsApp = async () => {
    setShowQRCode(true);
    await getQRCode(profId);
  };

  const handleRefreshQRCode = async () => {
    await getQRCode(profId);
  };

  const handleCopyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const runConnectionTest = async (customKey?: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-test-connection', {
        body: customKey ? { api_key: customKey } : {},
      });
      if (error) {
        setTestResult({ ok: false, stage: 'invoke', error: error.message });
        toast.error('Falha ao testar: ' + error.message);
        return;
      }
      setTestResult(data);
      if (data?.ok) toast.success(data.message || 'Conexão validada!');
      else toast.error(data?.error || 'Falha na validação');
    } catch (e: any) {
      setTestResult({ ok: false, stage: 'invoke', error: e.message });
      toast.error('Erro: ' + e.message);
    } finally {
      setIsTesting(false);
    }
  };

  const validateKeyFormat = (key: string): string[] => {
    const k = key.trim();
    const issues: string[] = [];
    if (k.length > 0 && k.length < 16) issues.push('Chave curta demais (esperado ≥ 16 caracteres).');
    if (/\s/.test(k)) issues.push('Remova espaços da chave.');
    if (/^Bearer/i.test(k)) issues.push('Não inclua o prefixo "Bearer".');
    if (/^['"].*['"]$/.test(k)) issues.push('Não inclua aspas em volta da chave.');
    return issues;
  };

  const getStatusBadge = () => {
    if (isLoading) return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Verificando...</Badge>;
    if (!connectionStatus?.configured) return <Badge variant="outline">Não configurado</Badge>;
    if (connectionStatus?.connected) return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Conectado</Badge>;
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
                Conecte o WhatsApp da clínica ou de cada profissional via QR Code
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Conexão</Label>
          <Select value={selectedProfId} onValueChange={(v) => { setSelectedProfId(v); setShowQRCode(false); clearQRCode(); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clinic">Clínica (número padrão)</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{(p as any).whatsapp_from_number ? ` — ${(p as any).whatsapp_from_number}` : ' (sem número cadastrado)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Cada profissional usa o número definido em seu cadastro como instância. Mensagens automáticas de cada profissional são enviadas pelo seu próprio WhatsApp conectado aqui.
          </p>
        </div>

        {connectionStatus?.configured && !connectionStatus?.connected && !showQRCode && (
          <>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>WhatsApp desconectado</AlertTitle>
              <AlertDescription>
                Esta instância não está conectada. Conecte para enviar mensagens automáticas.
                {connectionStatus.instance && (
                  <p className="text-xs mt-1 opacity-80">Instância: {connectionStatus.instance}</p>
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
                {isLoadingQR ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                Conectar WhatsApp
              </Button>
            </div>
          </>
        )}

        {connectionStatus?.configured && showQRCode && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-5 w-5" /> Conectar WhatsApp
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowQRCode(false); clearQRCode(); }}>Cancelar</Button>
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
                    <p className="font-medium">Escaneie o QR Code com o WhatsApp do {selectedProfId === 'clinic' ? 'número da clínica' : 'profissional'}</p>
                    <ol className="text-sm text-muted-foreground space-y-1 text-left">
                      <li>1. Abra o WhatsApp no celular</li>
                      <li>2. Configurações → Dispositivos Conectados</li>
                      <li>3. Conectar um dispositivo</li>
                      <li>4. Aponte para este QR Code</li>
                    </ol>
                  </div>

                  {pairingCode && (
                    <div className="w-full p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1 text-center">Ou use o código de pareamento:</p>
                      <div className="flex items-center justify-center gap-2">
                        <code className="text-lg font-mono font-bold tracking-wider">{pairingCode}</code>
                        <Button variant="ghost" size="sm" onClick={handleCopyPairingCode}>
                          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button variant="outline" size="sm" onClick={handleRefreshQRCode} disabled={isLoadingQR}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingQR ? 'animate-spin' : ''}`} />
                    Atualizar QR Code
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                  <p className="text-sm text-muted-foreground">Erro ao gerar QR Code</p>
                  <Button variant="outline" size="sm" onClick={handleRefreshQRCode} disabled={isLoadingQR}>Tentar novamente</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {connectionStatus?.configured && connectionStatus?.connected && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">WhatsApp conectado e funcionando</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Instância: {connectionStatus.instance}</p>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Verificar Conexão</h4>
            <p className="text-sm text-muted-foreground">Atualizar o status desta instância</p>
          </div>
          <Button variant="outline" onClick={() => checkConnection(profId)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Verificar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
