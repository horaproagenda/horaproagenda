import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle, CheckCircle, Loader2, MessageSquare, QrCode, RefreshCw, Save,
  ShieldCheck, Clock, Zap, Info, ShieldAlert,
} from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { useWhatsappConnectionKeepAlive } from '@/hooks/useWhatsappConnectionKeepAlive';
import { WhatsappQueueStatusPanel } from './WhatsappQueueStatusPanel';
import { WhatsappServerQueuePanel } from './WhatsappServerQueuePanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Professional = { id: string; name: string };
type Creds = {
  professional_id: string;
  is_active: boolean;
  last_connected_at: string | null;
};
type ConnectionSnapshot = {
  configured: boolean;
  connected: boolean;
  state?: string | null;
  checkedAt: string;
};

/**
 * Tela de WhatsApp para clientes do app.
 *
 * O cliente NÃO vê detalhes técnicos (provedor, instance_id, token, pool, custos).
 * Ele apenas clica em "Conectar ao WhatsApp" e escaneia o QR Code.
 *
 * A gestão de instâncias/custos é exclusiva do Super Admin (criador do app),
 * disponível em /super-admin.
 */
export function WhatsappSettings() {
  const {
    checkConnection, getQRCode, clearQRCode, qrCode, pairingCode, isLoading, isLoadingQR, setQRCodeDirect,
  } = useWhatsapp();

  const [myProfessionalId, setMyProfessionalId] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [credsMap, setCredsMap] = useState<Record<string, Creds>>({});
  const [quietHours, setQuietHours] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [savingQuiet, setSavingQuiet] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionByProf, setConnectionByProf] = useState<Record<string, ConnectionSnapshot>>({});
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [releaseApproved, setReleaseApproved] = useState<boolean | null>(null);

  const refreshConnection = useCallback(async (professionalId?: string) => {
    if (!professionalId) return null;
    const status = await checkConnection();
    if (status) {
      setConnectionByProf(prev => ({
        ...prev,
        [professionalId]: {
          configured: status.configured !== false,
          connected: status.connected === true,
          state: status.state ?? null,
          checkedAt: new Date().toISOString(),
        },
      }));
    } else {
      setConnectionByProf(prev => ({
        ...prev,
        [professionalId]: {
          configured: false,
          connected: false,
          state: null,
          checkedAt: new Date().toISOString(),
        },
      }));
    }
    return status;
  }, [checkConnection]);

  const syncSelectedConnectionStatus = useCallback((status: any) => {
    if (!selectedProfId || !status) return;
    setConnectionByProf(prev => ({
      ...prev,
      [selectedProfId]: {
        configured: status.configured !== false,
        connected: status.connected === true,
        state: status.state ?? null,
        checkedAt: new Date().toISOString(),
      },
    }));
  }, [selectedProfId]);

  // Bootstrap
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('professionals').select('id, name, whatsapp_release_approved').eq('user_id', user.id).maybeSingle();
      setMyProfessionalId(prof?.id ?? null);
      setReleaseApproved(prof ? !!(prof as any).whatsapp_release_approved : null);
      if (prof?.id) {
        setProfessionals([{ id: prof.id, name: prof.name || 'Meu WhatsApp' }]);
        setSelectedProfId(prof.id);
      }

      const { data: rows } = await supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, is_active, last_connected_at')
        .eq('professional_id', prof?.id ?? '00000000-0000-0000-0000-000000000000');
      const map: Record<string, Creds> = {};
      (rows ?? []).forEach((r: any) => { map[r.professional_id] = r; });
      setCredsMap(map);
    })();
  }, []);

  // Repolla aprovação da liberação do WhatsApp pelo Super Admin (a cada 20s) enquanto não aprovado.
  useEffect(() => {
    if (!myProfessionalId || releaseApproved) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('professionals')
        .select('whatsapp_release_approved')
        .eq('id', myProfessionalId)
        .maybeSingle();
      if (data && (data as any).whatsapp_release_approved) setReleaseApproved(true);
    }, 20000);
    return () => clearInterval(t);
  }, [myProfessionalId, releaseApproved]);

  useEffect(() => {
    if (selectedProfId) {
      clearQRCode();
      void refreshConnection(selectedProfId);
      (async () => {
        const { data } = await supabase
          .from('professionals')
          .select('quiet_hours_start, quiet_hours_end')
          .eq('id', selectedProfId)
          .maybeSingle();
        setQuietHours({
          start: data?.quiet_hours_start != null ? String(data.quiet_hours_start) : '',
          end: data?.quiet_hours_end != null ? String(data.quiet_hours_end) : '',
        });
      })();
    }
  }, [selectedProfId, clearQRCode, refreshConnection]);

  const handleSaveQuietHours = async () => {
    if (!selectedProfId) return;
    const start = quietHours.start === '' ? null : Number(quietHours.start);
    const end = quietHours.end === '' ? null : Number(quietHours.end);
    if ((start != null && end == null) || (start == null && end != null)) {
      toast.error('Preencha início e fim, ou deixe ambos vazios.');
      return;
    }
    if (start != null && end != null && (start < 0 || start > 23 || end < 0 || end > 23)) {
      toast.error('Use horas entre 0 e 23.');
      return;
    }
    setSavingQuiet(true);
    const { error } = await supabase
      .from('professionals')
      .update({ quiet_hours_start: start, quiet_hours_end: end })
      .eq('id', selectedProfId);
    setSavingQuiet(false);
    if (error) return toast.error('Erro ao salvar janela: ' + error.message);
    toast.success('Janela de envio salva.');
  };

  const selectedConnection = selectedProfId ? connectionByProf[selectedProfId] : null;
  const connected = selectedConnection?.connected === true;
  const configured = selectedConnection ? selectedConnection.configured !== false : Boolean(selectedProfId && credsMap[selectedProfId]);
  const selectedStatusLabel = !selectedProfId
    ? 'Login sem profissional vinculado'
    : !selectedConnection
      ? 'Verificando'
      : connected
        ? 'Conectado'
        : 'Desconectado';

  useWhatsappConnectionKeepAlive(selectedProfId || null, {
    enabled: !!selectedProfId && !!credsMap[selectedProfId],
    onStatus: syncSelectedConnectionStatus,
  });

  useEffect(() => {
    if (!selectedProfId || !connected) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, is_active, last_connected_at')
        .eq('professional_id', selectedProfId)
        .maybeSingle();
      if (cancelled || !data) return;
      setCredsMap(prev => ({ ...prev, [selectedProfId]: data as Creds }));
    })();
    return () => { cancelled = true; };
  }, [connected, selectedProfId, selectedConnection?.state]);

  // Realtime: reage instantaneamente a eventos do UltraMsg (webhook atualiza
  // professional_whatsapp_credentials.last_connected_at / is_active) sem
  // depender do polling de 4–60s.
  useEffect(() => {
    if (!selectedProfId) return;
    const channel = supabase
      .channel(`wpp-creds-${selectedProfId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professional_whatsapp_credentials',
          filter: `professional_id=eq.${selectedProfId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as Creds | undefined;
          if (row) setCredsMap(prev => ({ ...prev, [selectedProfId]: row }));
          // Reconsulta o status real (UltraMsg) em vez de assumir conectado.
          void refreshConnection(selectedProfId);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProfId, refreshConnection]);

  const selectedName = useMemo(() => {
    if (!selectedProfId) return '';
    return professionals.find(p => p.id === selectedProfId)?.name || 'Profissional';
  }, [selectedProfId, professionals]);

  const selectedCreds = selectedProfId ? credsMap[selectedProfId] : null;
  const lastConnectedAt = selectedCreds?.last_connected_at
    ? new Date(selectedCreds.last_connected_at).toLocaleString('pt-BR')
    : null;

  const handleConnect = async () => {
    setPermissionError(null);
    // Validação extra: garante que estamos sempre conectando o profissional do login.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const msg = 'Sessão expirada. Faça login novamente para conectar seu WhatsApp.';
      setPermissionError(msg);
      toast.error(msg);
      return;
    }
    const { data: ownProf } = await supabase
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
    if (!ownProf?.id) {
      const msg = 'Seu login não está vinculado a um cadastro de profissional desta clínica. Peça ao administrador para criar/vincular seu profissional em Cadastros → Profissionais usando o mesmo e-mail do seu login.';
      setPermissionError(msg);
      toast.error('Login sem profissional vinculado.');
      return;
    }
    if (selectedProfId && selectedProfId !== ownProf.id) {
      const msg = 'Você só pode conectar o WhatsApp do profissional vinculado ao seu próprio login.';
      setPermissionError(msg);
      toast.error(msg);
      return;
    }
    if (connected) {
      const ok = window.confirm(
        'Seu WhatsApp já está conectado. Gerar um novo QR Code irá desconectar a sessão atual. Deseja continuar?',
      );
      if (!ok) return;
    }
    setConnecting(true);
    try {
      // Endpoint único: reserva instância (se necessário) e retorna apenas o QR.
      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: {},
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Não foi possível conectar agora.');

      if (data.connected) {
        toast.success('WhatsApp já está conectado.');
        void refreshConnection(selectedProfId);
        return;
      }

      // Hidrata o QR vindo direto do whatsapp-connect (evita 2º round-trip).
      if (data.qrcode) {
        setQRCodeDirect(data.qrcode, data.pairingCode ?? null);
      }

      // Atualiza flags de credenciais em paralelo (não bloqueia a exibição do QR).
      void supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, is_active, last_connected_at')
        .eq('professional_id', selectedProfId).maybeSingle()
        .then(({ data: row }) => {
          if (row) setCredsMap(prev => ({ ...prev, [selectedProfId]: row as Creds }));
        });

      // Fallback: se por algum motivo o connect não trouxe QR, busca via getQRCode.
      if (!data.qrcode) {
        const qrResult = await getQRCode();
        if ((qrResult as any)?.connected) {
          await refreshConnection(selectedProfId);
          return;
        }
      }
      toast.success('QR Code gerado. Escaneie no seu celular.');
    } catch (e: any) {
      const raw = (e?.context?.error || e?.message || '').toString();
      const isForbidden = /403|Forbidden|só pode|vinculado ao usuário logado/i.test(raw);
      if (isForbidden) {
        setPermissionError(raw || 'Sem permissão para acessar o WhatsApp de outro profissional.');
      }
      toast.error(raw || 'Erro ao conectar WhatsApp.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle>WhatsApp</CardTitle>
              <CardDescription>
                Conecte o WhatsApp do seu login para enviar lembretes, confirmações e mensagens automáticas do seu próprio número.
              </CardDescription>
            </div>
          </div>
          <Badge className={connected ? 'bg-green-500' : undefined} variant={connected ? 'default' : 'outline'}>
            {isLoading && !selectedConnection ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : connected ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : null}
            {selectedStatusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {myProfessionalId ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            WhatsApp vinculado exclusivamente ao seu login: <span className="font-medium text-foreground">{selectedName}</span>.
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Login sem profissional vinculado</AlertTitle>
            <AlertDescription className="text-xs">
              Para garantir isolamento entre clínicas, o QR Code só é liberado para o profissional vinculado ao usuário logado.
            </AlertDescription>
          </Alert>
        )}

        {permissionError && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Sem permissão para este WhatsApp</AlertTitle>
            <AlertDescription className="text-xs">
              {permissionError}
            </AlertDescription>
          </Alert>
        )}

        {!connected && myProfessionalId && releaseApproved === false && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Validando seu cadastro…</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <p>Estamos confirmando seus dados e preparando uma instância de WhatsApp exclusiva para o seu login.</p>
              <p>Assim que a liberação for concluída pela equipe Hora Pro, o QR Code aparecerá aqui automaticamente — você não precisa atualizar a página.</p>
              <p className="text-[11px] text-muted-foreground">Isso costuma levar alguns minutos em horário comercial.</p>
            </AlertDescription>
          </Alert>
        )}

        {!connected && releaseApproved && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Como conectar seu WhatsApp com segurança</AlertTitle>
            <AlertDescription className="text-xs space-y-1.5">
              <p>Cada profissional tem o próprio QR Code — você só consegue conectar o WhatsApp vinculado ao seu login, nunca o de outra clínica ou colega.</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Confirme que o profissional acima é você (criado com o mesmo e-mail do seu login).</li>
                <li>Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>.</li>
                <li>Clique em <strong>Conectar ao WhatsApp</strong> abaixo e escaneie o QR exibido.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground">Se você é administrador e precisa que outro profissional conecte o WhatsApp dele, peça para ele acessar esta tela com o próprio login.</p>
            </AlertDescription>
          </Alert>
        )}

        {(connected || releaseApproved !== false) && (
          <Alert variant={connected || configured ? 'default' : 'destructive'}>
            {connected ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{connected ? 'Conexão ativa' : 'Conectar WhatsApp'}</AlertTitle>
            <AlertDescription className="text-xs">
              {connected
                ? `WhatsApp autenticado. Mensagens automáticas (lembretes, confirmações, follow-ups, aniversários e cobranças) saem da sua conta respeitando a janela de horário configurada.`
                : 'Clique em "Conectar ao WhatsApp" e escaneie o QR Code com o WhatsApp do seu login.'}
              {connected && lastConnectedAt && (
                <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Última verificação: {lastConnectedAt} · monitoramento automático a cada 60s
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <WhatsappQueueStatusPanel />
        <WhatsappServerQueuePanel autoDrainKey={connected ? selectedCreds?.last_connected_at ?? null : null} />

        {/* Botões de ação */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refreshConnection(selectedProfId || undefined)} disabled={isLoading || !selectedProfId}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Verificar conexão
          </Button>
          {!connected && selectedProfId && releaseApproved && (
            <Button
              onClick={handleConnect}
              disabled={connecting || isLoadingQR}
              className="bg-green-600 hover:bg-green-700"
            >
              {connecting || isLoadingQR
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : credsMap[selectedProfId]
                  ? <QrCode className="h-4 w-4 mr-2" />
                  : <Zap className="h-4 w-4 mr-2" />}
              Conectar ao WhatsApp
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
              <p className="font-medium text-foreground">
                Abra o WhatsApp {selectedName ? <>de <em>{selectedName}</em></> : null} no celular e leia o QR Code.
              </p>
              <p>WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>
              {pairingCode && <p>Código de pareamento: <span className="font-mono text-foreground">{pairingCode}</span></p>}
            </div>
          </div>
        )}

        {/* Janela de horário por profissional */}
        {selectedProfId && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium">Janela de envio das suas mensagens automáticas</p>
            <p className="text-[11px] text-muted-foreground">
              Horário permitido para lembretes, confirmações, pós-atendimento e aniversário do seu login.
              Fora da janela, as mensagens ficam enfileiradas e saem assim que a janela abrir.
            </p>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Label className="text-[11px] uppercase text-muted-foreground">Início (0–23)</Label>
                <Input
                  type="number" min={0} max={23}
                  value={quietHours.start}
                  onChange={(e) => setQuietHours(q => ({ ...q, start: e.target.value }))}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-5">
                <Label className="text-[11px] uppercase text-muted-foreground">Fim (exclusivo)</Label>
                <Input
                  type="number" min={0} max={23}
                  value={quietHours.end}
                  onChange={(e) => setQuietHours(q => ({ ...q, end: e.target.value }))}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <Button size="sm" variant="outline" onClick={handleSaveQuietHours} disabled={savingQuiet} className="h-8 w-full px-2">
                  {savingQuiet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
