import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Loader2, MessageSquare, QrCode, RefreshCw, Save, ShieldCheck, Users, Clock, Zap, Package, Plus, Trash2 } from 'lucide-react';
import { useWhatsapp } from '@/hooks/useWhatsapp';
import { useWhatsappConnectionKeepAlive } from '@/hooks/useWhatsappConnectionKeepAlive';
import { WhatsappQueueStatusPanel } from './WhatsappQueueStatusPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Professional = { id: string; name: string };
type Creds = {
  professional_id: string;
  api_url: string | null;
  instance_id: string;
  token: string;
  is_active: boolean;
  last_connected_at: string | null;
};

/**
 * WhatsApp settings — global salon account + each professional's own UltraMsg
 * instance. Each professional sends from their own connected number. When a
 * professional has no credentials configured the system falls back to the
 * global salon account so messages still go out.
 */
export function WhatsappSettings() {
  const {
    connectionStatus, checkConnection, getQRCode, qrCode, pairingCode, isLoading, isLoadingQR,
  } = useWhatsapp();

  const [isAdmin, setIsAdmin] = useState(false);
  const [myProfessionalId, setMyProfessionalId] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>(''); // '' = global
  const [credsMap, setCredsMap] = useState<Record<string, Creds>>({});
  const [form, setForm] = useState<{ api_url: string; instance_id: string; token: string }>({
    api_url: '', instance_id: '', token: '',
  });
  const [quietHours, setQuietHours] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [savingQuiet, setSavingQuiet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Pool (admin-only)
  type PoolRow = {
    id: string; instance_id: string; token: string; api_url: string | null;
    status: 'free' | 'assigned' | 'disabled';
    assigned_professional_id: string | null; assigned_at: string | null; notes: string | null;
  };
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [newPool, setNewPool] = useState({ instance_id: '', token: '', api_url: '', notes: '' });
  const [addingPool, setAddingPool] = useState(false);

  // Bootstrap: roles, my professional, list of professionals (admin only).
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rolesRows } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      const roles = (rolesRows ?? []).map((r: any) => r.role);
      const admin = roles.includes('admin');
      setIsAdmin(admin);

      const { data: prof } = await supabase
        .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
      setMyProfessionalId(prof?.id ?? null);

      if (admin) {
        const { data: profs } = await supabase
          .from('professionals').select('id, name').eq('is_active', true).order('name');
        setProfessionals((profs as Professional[]) ?? []);
        setSelectedProfId(''); // default to global view
      } else if (prof?.id) {
        setProfessionals([{ id: prof.id, name: 'Meu WhatsApp' }]);
        setSelectedProfId(prof.id);
      }

      // Load all visible creds
      const { data: rows } = await supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, api_url, instance_id, token, is_active, last_connected_at');
      const map: Record<string, Creds> = {};
      (rows ?? []).forEach((r: any) => { map[r.professional_id] = r; });
      setCredsMap(map);

      if (admin) await loadPool();
    })();
  }, []);

  const loadPool = async () => {
    setPoolLoading(true);
    const { data } = await supabase
      .from('ultramsg_instance_pool')
      .select('id, instance_id, token, api_url, status, assigned_professional_id, assigned_at, notes')
      .order('created_at', { ascending: true });
    setPool((data as PoolRow[]) ?? []);
    setPoolLoading(false);
  };

  const handleAddPoolInstance = async () => {
    if (!newPool.instance_id.trim() || !newPool.token.trim()) {
      toast.error('Informe instance_id e token.');
      return;
    }
    setAddingPool(true);
    const { error } = await supabase.from('ultramsg_instance_pool').insert({
      instance_id: newPool.instance_id.trim(),
      token: newPool.token.trim(),
      api_url: newPool.api_url.trim() || null,
      notes: newPool.notes.trim() || null,
      status: 'free',
    });
    setAddingPool(false);
    if (error) return toast.error('Erro ao adicionar: ' + error.message);
    toast.success('Instância adicionada ao pool.');
    setNewPool({ instance_id: '', token: '', api_url: '', notes: '' });
    void loadPool();
  };

  const handleRemovePoolInstance = async (row: PoolRow) => {
    if (row.status === 'assigned') {
      const ok = window.confirm(`Esta instância está atribuída a um profissional. Remover vai desconectar o WhatsApp dele. Confirma?`);
      if (!ok) return;
      // Also remove from credentials so it stops being used.
      if (row.assigned_professional_id) {
        await supabase.from('professional_whatsapp_credentials')
          .delete().eq('professional_id', row.assigned_professional_id);
      }
    }
    const { error } = await supabase.from('ultramsg_instance_pool').delete().eq('id', row.id);
    if (error) return toast.error('Erro ao remover: ' + error.message);
    toast.success('Removida do pool.');
    void loadPool();
    // Refresh creds map
    const { data: rows } = await supabase
      .from('professional_whatsapp_credentials')
      .select('professional_id, api_url, instance_id, token, is_active, last_connected_at');
    const m: Record<string, Creds> = {};
    (rows ?? []).forEach((r: any) => { m[r.professional_id] = r; });
    setCredsMap(m);
  };

  const handleClaimFromPool = async () => {
    if (!selectedProfId) {
      toast.error('Selecione um profissional.');
      return;
    }
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-claim-pool-instance', {
        body: { professional_id: selectedProfId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao reivindicar instância.');
      toast.success(`Instância ${data.instance} vinculada. Gere o QR Code para conectar o celular.`);
      // Refresh local state.
      const { data: row } = await supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, api_url, instance_id, token, is_active, last_connected_at')
        .eq('professional_id', selectedProfId).maybeSingle();
      if (row) setCredsMap(prev => ({ ...prev, [selectedProfId]: row as Creds }));
      if (isAdmin) void loadPool();
      void checkConnection(selectedProfId);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao reivindicar instância.');
    } finally {
      setClaiming(false);
    }
  };

  // When selected professional changes, populate the form and refresh status for that account.
  useEffect(() => {
    if (selectedProfId) {
      const c = credsMap[selectedProfId];
      setForm({
        api_url: c?.api_url || '',
        instance_id: c?.instance_id || '',
        token: c?.token || '',
      });
      void checkConnection(selectedProfId);
      // Load quiet hours for this professional
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
    } else {
      setForm({ api_url: '', instance_id: '', token: '' });
      setQuietHours({ start: '', end: '' });
      void checkConnection(undefined);
    }
  }, [selectedProfId, credsMap, checkConnection]);

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


  const connected = connectionStatus?.connected === true;
  const configured = connectionStatus?.configured !== false;
  const usingFallback = !!selectedProfId && connectionStatus?.source === 'global';

  // Keep-alive: faz ping silencioso a cada 60s para manter a sessão saudável
  // e detectar quedas cedo, evitando que o profissional ache que precisa
  // criar uma nova instância.
  useWhatsappConnectionKeepAlive(selectedProfId || null, {
    enabled: !!selectedProfId && !!credsMap[selectedProfId],
  });

  // Quando o ping confirma conexão, re-carrega last_connected_at da tabela
  // (o edge function atualizou esse timestamp) para refletir na UI.
  useEffect(() => {
    if (!selectedProfId || !connected) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('professional_whatsapp_credentials')
        .select('professional_id, api_url, instance_id, token, is_active, last_connected_at')
        .eq('professional_id', selectedProfId)
        .maybeSingle();
      if (cancelled || !data) return;
      setCredsMap(prev => ({ ...prev, [selectedProfId]: data as Creds }));
    })();
    return () => { cancelled = true; };
  }, [connected, selectedProfId, connectionStatus?.state]);

  const selectedName = useMemo(() => {
    if (!selectedProfId) return 'Conta do salão (global)';
    return professionals.find(p => p.id === selectedProfId)?.name || 'Profissional';
  }, [selectedProfId, professionals]);

  const selectedCreds = selectedProfId ? credsMap[selectedProfId] : null;
  const lastConnectedAt = selectedCreds?.last_connected_at
    ? new Date(selectedCreds.last_connected_at).toLocaleString('pt-BR')
    : null;

  const handleGenerateQr = async () => {
    if (!selectedProfId) {
      toast.error('Selecione um profissional para gerar o QR Code da conta dele.');
      return;
    }
    if (!credsMap[selectedProfId]) {
      toast.error('Salve o instance_id e token do profissional antes de gerar o QR Code.');
      return;
    }
    // Proteção: se já está conectado, gerar novo QR pode invalidar a sessão atual.
    // Só prossegue após confirmação explícita do usuário.
    if (connected) {
      const ok = window.confirm(
        'O WhatsApp deste profissional já está conectado. Gerar um novo QR Code irá desconectar a sessão atual e exigir nova leitura no celular. Deseja continuar?',
      );
      if (!ok) return;
    }
    await getQRCode(selectedProfId);
  };

  const handleSaveCreds = async () => {
    if (!selectedProfId) {
      toast.error('A conta global é configurada via secrets (ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN).');
      return;
    }
    if (!form.instance_id.trim() || !form.token.trim()) {
      toast.error('Informe instance_id e token.');
      return;
    }
    // Proteção: trocar o instance_id quando já existe uma instância conectada
    // significa abandonar a sessão antiga. Confirma antes para evitar criar
    // instâncias novas por engano.
    const existing = credsMap[selectedProfId];
    if (existing && existing.instance_id && existing.instance_id !== form.instance_id.trim()) {
      const ok = window.confirm(
        `Você está mudando o Instance ID de "${existing.instance_id}" para "${form.instance_id.trim()}". A sessão WhatsApp atual será abandonada. Confirma a troca?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    const payload = {
      professional_id: selectedProfId,
      api_url: form.api_url.trim() || null,
      instance_id: form.instance_id.trim(),
      token: form.token.trim(),
      is_active: true,
    };
    const { error } = await supabase
      .from('professional_whatsapp_credentials')
      .upsert(payload, { onConflict: 'professional_id' });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Credenciais salvas. Agora gere o QR Code para conectar.');
    setCredsMap(prev => ({ ...prev, [selectedProfId]: { ...(prev[selectedProfId] || {} as Creds), ...payload } as Creds }));
    void checkConnection(selectedProfId);
  };


  const handleDisable = async () => {
    if (!selectedProfId) return;
    const { error } = await supabase
      .from('professional_whatsapp_credentials')
      .delete().eq('professional_id', selectedProfId);
    if (error) return toast.error('Erro ao remover: ' + error.message);
    toast.success('Credenciais removidas. Mensagens desse profissional voltam a usar a conta do salão.');
    setCredsMap(prev => { const n = { ...prev }; delete n[selectedProfId]; return n; });
    setForm({ api_url: '', instance_id: '', token: '' });
    void checkConnection(selectedProfId);
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
              <CardTitle>WhatsApp (UltraMsg)</CardTitle>
              <CardDescription>
                Cada profissional pode conectar seu próprio WhatsApp. Quem não conectar usa a conta do salão.
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
        {/* Selector */}
        <div className="space-y-2">
          <Label className="text-[11px] uppercase text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> Conta para gerenciar
          </Label>
          <select
            value={selectedProfId}
            onChange={(e) => setSelectedProfId(e.target.value)}
            disabled={!isAdmin && !myProfessionalId}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {isAdmin && <option value="">Conta do salão (global, fallback)</option>}
            {professionals.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {credsMap[p.id] ? '• conta própria' : '• usa fallback'}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Visualizando: <span className="font-medium text-foreground">{selectedName}</span>
          </p>
        </div>

        <Alert variant={connected || configured ? 'default' : 'destructive'}>
          {connected ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{connected ? 'Conexão ativa' : 'Conectar WhatsApp'}</AlertTitle>
          <AlertDescription className="text-xs">
            {connected ? (
              usingFallback
                ? 'Este profissional ainda não tem conta própria. As mensagens dele estão sendo enviadas pela conta do salão.'
                : `WhatsApp autenticado. Mensagens automáticas (lembretes, confirmações, follow-ups, aniversários, cobranças e alertas) saem desta conta respeitando a janela de horário configurada.`
            ) : (
              connectionStatus?.message || connectionStatus?.error || 'Salve as credenciais UltraMsg e gere o QR Code para conectar.'
            )}
            {connected && lastConnectedAt && (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Última verificação: {lastConnectedAt} · monitoramento automático a cada 60s
              </div>
            )}
          </AlertDescription>
        </Alert>

        <WhatsappQueueStatusPanel />



        {/* Credentials editor: only for a selected professional */}
        {selectedProfId && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Credenciais UltraMsg deste profissional</p>
              {credsMap[selectedProfId] && (
                <Button size="sm" variant="ghost" onClick={handleDisable} className="h-7 text-xs text-destructive">
                  Remover (usar fallback)
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Instance ID</Label>
                <Input
                  value={form.instance_id}
                  onChange={(e) => setForm(f => ({ ...f, instance_id: e.target.value }))}
                  placeholder="instanceXXXXX"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Token</Label>
                <Input
                  value={form.token}
                  onChange={(e) => setForm(f => ({ ...f, token: e.target.value }))}
                  placeholder="token UltraMsg"
                  className="h-8 text-xs"
                  type="password"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px] uppercase text-muted-foreground">API URL (opcional)</Label>
                <Input
                  value={form.api_url}
                  onChange={(e) => setForm(f => ({ ...f, api_url: e.target.value }))}
                  placeholder="https://api.ultramsg.com (padrão)"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleSaveCreds} disabled={saving} className="h-8">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Salvar credenciais
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cada profissional cria conta gratuita em <code className="text-foreground">ultramsg.com</code>, copia
              o <code className="text-foreground">instance_id</code> e o <code className="text-foreground">token</code> e cola aqui.
              Depois clica em <em>Gerar QR Code</em> e lê no celular dele.
            </p>
          </div>
        )}

        {/* Per-professional quiet hours (each pro manages only their own here) */}
        {selectedProfId && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium">Janela de envio das mensagens automáticas</p>
            <p className="text-[11px] text-muted-foreground">
              Horário permitido para lembretes, confirmações, pós-atendimento e aniversário deste profissional.
              Fora da janela, as mensagens ficam enfileiradas e saem assim que a janela abrir. Deixe vazio para usar o padrão do template.
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


        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => checkConnection(selectedProfId || undefined)} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Verificar conexão
          </Button>
          {!connected && selectedProfId && !credsMap[selectedProfId] && (
            <Button onClick={handleClaimFromPool} disabled={claiming} className="bg-green-600 hover:bg-green-700">
              {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Conectar ao WhatsApp (automático)
            </Button>
          )}
          {!connected && selectedProfId && credsMap[selectedProfId] && (
            <Button onClick={handleGenerateQr} disabled={isLoadingQR}>
              {isLoadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              Gerar QR Code
            </Button>
          )}
        </div>
        {!connected && selectedProfId && !credsMap[selectedProfId] && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            Ao clicar em <em>Conectar ao WhatsApp (automático)</em>, o app reserva uma instância já paga pelo salão e mostra o QR Code para o profissional escanear no celular dele. Sem precisar criar conta no UltraMsg.
          </p>
        )}

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
                Abra o WhatsApp do profissional <em>{selectedName}</em> no celular e leia o QR Code.
              </p>
              <p>WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>
              {pairingCode && <p>Código de pareamento: <span className="font-mono text-foreground">{pairingCode}</span></p>}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium">Pool de instâncias UltraMsg (pago pelo salão)</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Livres: <span className="font-medium text-foreground">{pool.filter(p => p.status === 'free').length}</span></span>
                <span>·</span>
                <span>Em uso: <span className="font-medium text-foreground">{pool.filter(p => p.status === 'assigned').length}</span></span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Compre instâncias em <code>user.ultramsg.com</code> com sua conta. Para cada instância paga, cole abaixo o Instance ID e o Token. Quando um profissional clicar em <em>Conectar ao WhatsApp (automático)</em>, o app pega a próxima instância livre desta lista.
            </p>

            <div className="grid gap-2 sm:grid-cols-4">
              <Input
                value={newPool.instance_id}
                onChange={(e) => setNewPool(p => ({ ...p, instance_id: e.target.value }))}
                placeholder="instanceXXXXX"
                className="h-8 text-xs"
              />
              <Input
                value={newPool.token}
                onChange={(e) => setNewPool(p => ({ ...p, token: e.target.value }))}
                placeholder="token UltraMsg"
                className="h-8 text-xs"
                type="password"
              />
              <Input
                value={newPool.notes}
                onChange={(e) => setNewPool(p => ({ ...p, notes: e.target.value }))}
                placeholder="anotação (opcional)"
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={handleAddPoolInstance} disabled={addingPool} className="h-8">
                {addingPool ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Adicionar
              </Button>
            </div>

            {poolLoading ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Carregando…
              </div>
            ) : pool.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Nenhuma instância no pool. Adicione a primeira acima.
              </p>
            ) : (
              <div className="space-y-1">
                {pool.map((row) => {
                  const profName = row.assigned_professional_id
                    ? professionals.find(p => p.id === row.assigned_professional_id)?.name ?? '—'
                    : null;
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="text-foreground truncate">{row.instance_id}</code>
                        {row.status === 'free' && <Badge variant="outline" className="text-[10px]">livre</Badge>}
                        {row.status === 'assigned' && (
                          <Badge className="bg-green-500 text-[10px]">em uso · {profName}</Badge>
                        )}
                        {row.status === 'disabled' && <Badge variant="destructive" className="text-[10px]">desabilitada</Badge>}
                        {row.notes && <span className="text-muted-foreground truncate">· {row.notes}</span>}
                      </div>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => handleRemovePoolInstance(row)}
                        className="h-7 w-7 text-destructive"
                        title="Remover do pool"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
