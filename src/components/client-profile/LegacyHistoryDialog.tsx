import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addMinutes, parse as parseDate, isValid as isValidDate } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import {
  History, Sparkles, Package, Layers, Upload, Plus, Trash2, Loader2, Info, Download, CheckCircle2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useServices } from '@/hooks/useServices';
import { useProfessionals } from '@/hooks/useProfessionals';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

interface LegacyHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SessionRow {
  id: string;
  date: string;
  time: string;
  duration: string;
  amount_paid: string;
  payment_date: string;
  notes?: string;
}

const newSessionRow = (preset?: Partial<SessionRow>): SessionRow => ({
  id: crypto.randomUUID(),
  date: '',
  time: '09:00',
  duration: '60',
  amount_paid: '',
  payment_date: '',
  ...preset,
});

function buildLocalISO(dateStr: string, timeStr: string): string | null {
  // dateStr yyyy-mm-dd, timeStr HH:mm — build in local TZ then convert to ISO UTC
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return null;
  const local = new Date(y, m - 1, d, hh, mm, 0, 0);
  return local.toISOString();
}

export function LegacyHistoryDialog({ open, onOpenChange, clientId, clientName }: LegacyHistoryDialogProps) {
  const qc = useQueryClient();
  const { services } = useServices();
  const { professionals } = useProfessionals();
  const { paymentMethods } = usePaymentMethods();

  const [tab, setTab] = useState<'single' | 'common' | 'sequential' | 'csv'>('single');
  const [submitting, setSubmitting] = useState(false);

  // Common fields
  const [serviceId, setServiceId] = useState<string>('');
  const [professionalId, setProfessionalId] = useState<string>('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [createFinancial, setCreateFinancial] = useState(true);

  // Single
  const [singleDate, setSingleDate] = useState('');
  const [singleTime, setSingleTime] = useState('09:00');
  const [singleDuration, setSingleDuration] = useState('60');
  const [singleAmount, setSingleAmount] = useState('');
  const [singlePaymentDate, setSinglePaymentDate] = useState('');
  const [singleNotes, setSingleNotes] = useState('');

  // Package (common + sequential)
  const [pkgName, setPkgName] = useState('');
  const [pkgTotalSessions, setPkgTotalSessions] = useState('4');
  const [pkgTotalPrice, setPkgTotalPrice] = useState('');
  const [pkgPaymentDate, setPkgPaymentDate] = useState('');
  const [pkgIntervalDays, setPkgIntervalDays] = useState('30'); // sequential
  const [pkgSessions, setPkgSessions] = useState<SessionRow[]>([newSessionRow(), newSessionRow()]);

  // CSV
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const serviceOptions = useMemo(
    () => services.filter((s: any) => s.is_active).map((s: any) => ({
      value: s.id, label: s.name, sublabel: `${s.duration ?? 60}min`,
    })),
    [services]
  );
  const profOptions = useMemo(
    () => professionals.filter((p: any) => p.is_active).map((p: any) => ({ value: p.id, label: p.name })),
    [professionals]
  );
  const paymentOptions = useMemo(
    () => (paymentMethods || []).filter((p: any) => p.is_active !== false).map((p: any) => ({ value: p.id, label: p.name })),
    [paymentMethods]
  );

  const selectedService = useMemo(() => services.find((s: any) => s.id === serviceId), [services, serviceId]);

  const ensureAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Não autenticado');
    return session.access_token;
  };

  const createLegacyAppointment = async (params: {
    start_time: string;
    end_time: string;
    service_id?: string | null;
    professional_id?: string | null;
    package_appointment_id?: string | null;
    notes?: string;
  }) => {
    const token = await ensureAuth();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        client_id: clientId,
        service_id: params.service_id || null,
        professional_id: params.professional_id || null,
        room_id: null,
        start_time: params.start_time,
        end_time: params.end_time,
        notes: params.notes ? `[Histórico] ${params.notes}` : '[Histórico] Cadastro retroativo',
        status: 'completed',
        package_appointment_id: params.package_appointment_id || null,
        legacy: true,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      const msg = json.errors?.map((e: any) => e.message).join(', ') || json.error || 'Falha ao criar agendamento';
      throw new Error(msg);
    }
    return json.data;
  };

  const createFinancialEntry = async (params: {
    amount: number;
    payment_date: string; // yyyy-mm-dd
    description: string;
    appointment_id?: string | null;
  }) => {
    if (!createFinancial || !params.amount || !params.payment_date) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('financial_entries').insert({
      type: 'income',
      status: 'paid',
      amount: params.amount,
      original_amount: params.amount,
      due_date: params.payment_date,
      paid_date: params.payment_date,
      description: params.description,
      client_id: clientId,
      appointment_id: params.appointment_id || null,
      payment_method_id: paymentMethodId || null,
      professional_id: professionalId || null,
      created_by: user?.id,
      notes: 'Lançamento retroativo (histórico antigo)',
    });
    if (error) throw error;
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['client-appointments'] });
    qc.invalidateQueries({ queryKey: ['client_profile', clientId] });
    qc.invalidateQueries({ queryKey: ['service_packages'] });
    qc.invalidateQueries({ queryKey: ['financial_entries'] });
  };

  // ============ SINGLE ============
  const handleSubmitSingle = async () => {
    if (!singleDate || !singleTime) { toast.error('Informe data e horário'); return; }
    const start = buildLocalISO(singleDate, singleTime);
    if (!start) { toast.error('Data/horário inválidos'); return; }
    const dur = parseInt(singleDuration) || (selectedService?.duration ?? 60);
    const end = new Date(new Date(start).getTime() + dur * 60_000).toISOString();

    setSubmitting(true);
    try {
      const apt = await createLegacyAppointment({
        start_time: start,
        end_time: end,
        service_id: serviceId || null,
        professional_id: professionalId || null,
        notes: singleNotes,
      });
      const amount = parseFloat(singleAmount.replace(',', '.')) || 0;
      if (amount > 0) {
        await createFinancialEntry({
          amount,
          payment_date: singlePaymentDate || singleDate,
          description: `${selectedService?.name || 'Atendimento'} — ${clientName} (Histórico)`,
          appointment_id: apt?.id || null,
        });
      }
      invalidateAll();
      toast.success('Agendamento histórico cadastrado!');
      resetSingle();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao cadastrar histórico');
    } finally {
      setSubmitting(false);
    }
  };

  const resetSingle = () => {
    setSingleDate(''); setSingleTime('09:00'); setSingleDuration('60');
    setSingleAmount(''); setSinglePaymentDate(''); setSingleNotes('');
  };

  // ============ PACKAGES ============
  const updateSession = (id: string, patch: Partial<SessionRow>) => {
    setPkgSessions((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addSession = () => setPkgSessions((rows) => [...rows, newSessionRow({ duration: String(selectedService?.duration ?? 60) })]);
  const removeSession = (id: string) => setPkgSessions((rows) => rows.filter((r) => r.id !== id));

  const handleSubmitPackage = async (kind: 'common' | 'sequential') => {
    if (!serviceId) { toast.error('Selecione o serviço base do pacote'); return; }
    const total = parseInt(pkgTotalSessions) || pkgSessions.length;
    if (total < 1) { toast.error('Total de sessões inválido'); return; }
    if (pkgSessions.some((r) => !r.date || !r.time)) { toast.error('Preencha data e horário de todas as sessões'); return; }
    const totalPrice = parseFloat(pkgTotalPrice.replace(',', '.')) || 0;
    // Nome do pacote é derivado automaticamente do serviço selecionado
    const derivedPkgName = `${selectedService?.name || 'Pacote'} — ${total} sessões`;

    setSubmitting(true);
    try {
      // 1. Create service_package
      const { data: { user } } = await supabase.auth.getUser();
      const { data: pkg, error: pkgErr } = await supabase
        .from('service_packages')
        .insert({
          name: derivedPkgName,
          client_id: clientId,
          service_id: serviceId,
          professional_id: professionalId || null,
          total_sessions: total,
          sessions_scheduled: pkgSessions.length,
          total_price: totalPrice,
          duration: selectedService?.duration ?? 60,
          package_type: kind === 'sequential' ? 'sequential' : 'standard',
          interval_days: kind === 'sequential' ? (parseInt(pkgIntervalDays) || 30) : null,
          payment_method: paymentMethodId ? (paymentMethods?.find((m: any) => m.id === paymentMethodId)?.name || null) : null,
          payment_methods: paymentMethodId ? [paymentMethods?.find((m: any) => m.id === paymentMethodId)?.name].filter(Boolean) : null,
          is_active: true,
          updated_by: user?.id,
        })
        .select()
        .single();
      if (pkgErr) throw pkgErr;

      // 2. For each session: create package_appointment + appointment, link them
      for (let i = 0; i < pkgSessions.length; i++) {
        const row = pkgSessions[i];
        const start = buildLocalISO(row.date, row.time);
        if (!start) continue;
        const dur = parseInt(row.duration) || (selectedService?.duration ?? 60);
        const end = new Date(new Date(start).getTime() + dur * 60_000).toISOString();

        // Create package_appointment first
        const paInsert: any = {
          package_id: pkg.id,
          session_number: i + 1,
          original_session_number: i + 1,
          status: 'completed',
          scheduled_date: start,
          service_id: serviceId,
        };
        if (kind === 'sequential') {
          paInsert.sequence_order = i + 1;
          paInsert.interval_after_days = i < pkgSessions.length - 1 ? (parseInt(pkgIntervalDays) || 30) : 0;
        }
        const { data: pa, error: paErr } = await supabase
          .from('package_appointments')
          .insert(paInsert)
          .select()
          .single();
        if (paErr) throw paErr;

        // Create appointment linked
        const apt = await createLegacyAppointment({
          start_time: start,
          end_time: end,
          service_id: serviceId,
          professional_id: professionalId || null,
          package_appointment_id: pa.id,
          notes: row.notes || `Sessão ${i + 1}/${total} — ${derivedPkgName}`,
        });

        // Link back
        await supabase.from('package_appointments').update({ appointment_id: apt.id }).eq('id', pa.id);

        // Per-session financial (optional)
        const amt = parseFloat((row.amount_paid || '').replace(',', '.')) || 0;
        if (amt > 0) {
          await createFinancialEntry({
            amount: amt,
            payment_date: row.payment_date || row.date,
            description: `Sessão ${i + 1}/${total} — ${derivedPkgName} (Histórico)`,
            appointment_id: apt.id,
          });
        }
      }

      // 3. Single financial entry for total package payment (if no per-session amounts and total > 0)
      const anyPerSession = pkgSessions.some((r) => parseFloat((r.amount_paid || '').replace(',', '.')) > 0);
      if (totalPrice > 0 && !anyPerSession) {
        await createFinancialEntry({
          amount: totalPrice,
          payment_date: pkgPaymentDate || pkgSessions[0].date,
          description: `Pacote ${derivedPkgName} — ${clientName} (Histórico)`,
        });
      }

      invalidateAll();
      toast.success(`Pacote ${kind === 'sequential' ? 'sequencial' : 'comum'} histórico cadastrado!`);
      resetPackage();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao cadastrar pacote histórico');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPackage = () => {
    setPkgName(''); setPkgTotalSessions('4'); setPkgTotalPrice(''); setPkgPaymentDate('');
    setPkgIntervalDays('30');
    setPkgSessions([newSessionRow(), newSessionRow()]);
  };

  // ============ CSV ============
  const downloadCsvTemplate = () => {
    const tpl = `data;hora;duracao_min;servico;profissional;valor_pago;data_pagamento;observacoes
15/01/2024;09:00;60;Limpeza de Pele;Ana Costa;150,00;15/01/2024;Cliente antigo
20/02/2024;14:30;90;Massagem;Carlos Lima;200;20/02/2024;`;
    const blob = new Blob(['\ufeff' + tpl], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo_historico_cliente.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitCsv = async () => {
    if (!csvText.trim()) { toast.error('Cole o conteúdo do CSV'); return; }
    setSubmitting(true);
    setCsvResult(null);
    const errors: string[] = [];
    let success = 0; let failed = 0;

    try {
      const lines = csvText.split('\n').filter((l) => l.trim()).map((l) => l.replace(/\r$/, ''));
      if (lines.length < 2) throw new Error('CSV vazio');
      const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
      const idx = (key: string) => headers.findIndex((h) => h.includes(key));
      const cDate = idx('data');
      const cTime = idx('hora');
      const cDur = idx('dur');
      const cSvc = idx('servico') >= 0 ? idx('servico') : idx('serviço');
      const cProf = idx('profis');
      const cAmt = idx('valor');
      const cPay = idx('pagamento');
      const cNotes = idx('obs');
      if (cDate === -1 || cTime === -1) throw new Error('Colunas obrigatórias: data, hora');

      const norm = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const parseBrDate = (s: string): string | null => {
        const cleaned = s.trim();
        for (const fmt of ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy']) {
          try {
            const d = parseDate(cleaned, fmt, new Date());
            if (isValidDate(d)) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            }
          } catch {}
        }
        return null;
      };

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
        try {
          const dateIso = parseBrDate(cols[cDate] || '');
          const timeStr = (cols[cTime] || '').padStart(5, '0');
          if (!dateIso || !/^\d{1,2}:\d{2}$/.test(timeStr)) throw new Error('data/hora inválidas');
          const dur = parseInt(cols[cDur] || '60') || 60;
          const start = buildLocalISO(dateIso, timeStr);
          if (!start) throw new Error('falha ao montar data');
          const end = new Date(new Date(start).getTime() + dur * 60_000).toISOString();

          const svcName = cSvc >= 0 ? cols[cSvc] : '';
          const profName = cProf >= 0 ? cols[cProf] : '';
          const matchedSvc = svcName ? services.find((s: any) => norm(s.name) === norm(svcName) || norm(s.name).includes(norm(svcName))) : null;
          const matchedProf = profName ? professionals.find((p: any) => norm(p.name) === norm(profName) || norm(p.name).includes(norm(profName))) : null;

          const apt = await createLegacyAppointment({
            start_time: start,
            end_time: end,
            service_id: matchedSvc?.id || null,
            professional_id: matchedProf?.id || professionalId || null,
            notes: cNotes >= 0 ? cols[cNotes] : '',
          });

          const amt = cAmt >= 0 ? parseFloat((cols[cAmt] || '').replace('.', '').replace(',', '.')) : 0;
          const payDate = cPay >= 0 ? parseBrDate(cols[cPay] || '') || dateIso : dateIso;
          if (amt > 0) {
            await createFinancialEntry({
              amount: amt,
              payment_date: payDate,
              description: `${matchedSvc?.name || 'Atendimento'} — ${clientName} (Histórico)`,
              appointment_id: apt?.id || null,
            });
          }
          success++;
        } catch (rowErr: any) {
          failed++;
          errors.push(`Linha ${i + 1}: ${rowErr.message || 'erro'}`);
        }
      }

      setCsvResult({ success, failed, errors: errors.slice(0, 10) });
      invalidateAll();
      if (success > 0) toast.success(`${success} registros importados`);
      if (failed > 0) toast.error(`${failed} linhas com erro`);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao processar CSV');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Cadastrar histórico antigo — {clientName}
          </DialogTitle>
          <DialogDescription>
            Registre atendimentos, pacotes e pagamentos anteriores ao uso do app. Marcamos como "[Histórico]" e não validamos conflitos/horário comercial.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-4 h-9">
            <TabsTrigger value="single" className="text-xs gap-1"><Sparkles className="h-3.5 w-3.5" />Avulso</TabsTrigger>
            <TabsTrigger value="common" className="text-xs gap-1"><Package className="h-3.5 w-3.5" />Pacote comum</TabsTrigger>
            <TabsTrigger value="sequential" className="text-xs gap-1"><Layers className="h-3.5 w-3.5" />Sequencial</TabsTrigger>
            <TabsTrigger value="csv" className="text-xs gap-1"><Upload className="h-3.5 w-3.5" />CSV em lote</TabsTrigger>
          </TabsList>

          {/* Shared selectors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <div>
              <Label className="text-[10px]">Serviço {tab !== 'single' && tab !== 'csv' ? '(obrigatório)' : '(opcional)'}</Label>
              <SearchableSelect
                options={serviceOptions}
                value={serviceId}
                onChange={setServiceId}
                placeholder="Selecione o serviço"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Profissional</Label>
              <SearchableSelect
                options={profOptions}
                value={professionalId}
                onChange={setProfessionalId}
                placeholder="Selecione o profissional"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Forma de pagamento</Label>
              <SearchableSelect
                options={paymentOptions}
                value={paymentMethodId}
                onChange={setPaymentMethodId}
                placeholder="Forma de pagamento"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2 text-xs">
            <Switch id="legacy-fin" checked={createFinancial} onCheckedChange={setCreateFinancial} />
            <Label htmlFor="legacy-fin" className="cursor-pointer">Lançar pagamentos no financeiro com data retroativa</Label>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-2">
            <TabsContent value="single" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Horário</Label>
                  <Input type="time" value={singleTime} onChange={(e) => setSingleTime(e.target.value)} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Duração (min)</Label>
                  <Input type="number" value={singleDuration} onChange={(e) => setSingleDuration(e.target.value)} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Valor pago (R$)</Label>
                  <Input type="text" inputMode="decimal" value={singleAmount} onChange={(e) => setSingleAmount(e.target.value)} placeholder="0,00" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Data do pagamento</Label>
                  <Input type="date" value={singlePaymentDate} onChange={(e) => setSinglePaymentDate(e.target.value)} className="h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={singleNotes} onChange={(e) => setSingleNotes(e.target.value)} rows={2} className="text-xs" />
              </div>
            </TabsContent>

            <TabsContent value="common" className="mt-0">
              <PackageForm
                kind="common"
                pkgName={pkgName} setPkgName={setPkgName}
                pkgTotalSessions={pkgTotalSessions} setPkgTotalSessions={setPkgTotalSessions}
                pkgTotalPrice={pkgTotalPrice} setPkgTotalPrice={setPkgTotalPrice}
                pkgPaymentDate={pkgPaymentDate} setPkgPaymentDate={setPkgPaymentDate}
                pkgSessions={pkgSessions}
                addSession={addSession} removeSession={removeSession} updateSession={updateSession}
              />
            </TabsContent>

            <TabsContent value="sequential" className="mt-0">
              <PackageForm
                kind="sequential"
                pkgName={pkgName} setPkgName={setPkgName}
                pkgTotalSessions={pkgTotalSessions} setPkgTotalSessions={setPkgTotalSessions}
                pkgTotalPrice={pkgTotalPrice} setPkgTotalPrice={setPkgTotalPrice}
                pkgPaymentDate={pkgPaymentDate} setPkgPaymentDate={setPkgPaymentDate}
                pkgIntervalDays={pkgIntervalDays} setPkgIntervalDays={setPkgIntervalDays}
                pkgSessions={pkgSessions}
                addSession={addSession} removeSession={removeSession} updateSession={updateSession}
              />
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 mt-0">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Cole o CSV com cabeçalho: <strong>data;hora;duracao_min;servico;profissional;valor_pago;data_pagamento;observacoes</strong>
                </AlertDescription>
              </Alert>
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" /> Baixar modelo
              </Button>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                placeholder="data;hora;duracao_min;servico;profissional;valor_pago;data_pagamento;observacoes&#10;15/01/2024;09:00;60;Limpeza;Ana;150,00;15/01/2024;"
                className="text-xs font-mono"
              />
              {csvResult && (
                <div className="space-y-2 p-3 rounded bg-muted/50">
                  <div className="flex gap-2 text-xs">
                    <Badge className="bg-green-500/10 text-green-600 gap-1"><CheckCircle2 className="h-3 w-3" />{csvResult.success} importados</Badge>
                    {csvResult.failed > 0 && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{csvResult.failed} falharam</Badge>}
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {csvResult.errors.map((e, i) => <div key={i}>• {e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          {tab === 'single' && (
            <Button onClick={handleSubmitSingle} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Cadastrar atendimento
            </Button>
          )}
          {tab === 'common' && (
            <Button onClick={() => handleSubmitPackage('common')} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Cadastrar pacote comum
            </Button>
          )}
          {tab === 'sequential' && (
            <Button onClick={() => handleSubmitPackage('sequential')} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Cadastrar pacote sequencial
            </Button>
          )}
          {tab === 'csv' && (
            <Button onClick={handleSubmitCsv} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Importar CSV
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====== Sub-component: Package Form ======
interface PackageFormProps {
  kind: 'common' | 'sequential';
  pkgName: string; setPkgName: (v: string) => void;
  pkgTotalSessions: string; setPkgTotalSessions: (v: string) => void;
  pkgTotalPrice: string; setPkgTotalPrice: (v: string) => void;
  pkgPaymentDate: string; setPkgPaymentDate: (v: string) => void;
  pkgIntervalDays?: string; setPkgIntervalDays?: (v: string) => void;
  pkgSessions: SessionRow[];
  addSession: () => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<SessionRow>) => void;
}

function PackageForm(props: PackageFormProps) {
  const {
    kind, pkgName, setPkgName, pkgTotalSessions, setPkgTotalSessions,
    pkgTotalPrice, setPkgTotalPrice, pkgPaymentDate, setPkgPaymentDate,
    pkgIntervalDays, setPkgIntervalDays, pkgSessions,
    addSession, removeSession, updateSession,
  } = props;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Total de sessões</Label>
          <Input type="number" value={pkgTotalSessions} onChange={(e) => setPkgTotalSessions(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Valor total pago (R$)</Label>
          <Input type="text" inputMode="decimal" value={pkgTotalPrice} onChange={(e) => setPkgTotalPrice(e.target.value)} placeholder="0,00" className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Data do pagamento (total)</Label>
          <Input type="date" value={pkgPaymentDate} onChange={(e) => setPkgPaymentDate(e.target.value)} className="h-9" />
        </div>
        {kind === 'sequential' && setPkgIntervalDays && (
          <div>
            <Label className="text-xs">Intervalo entre sessões (dias)</Label>
            <Input type="number" value={pkgIntervalDays || '30'} onChange={(e) => setPkgIntervalDays(e.target.value)} className="h-9" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Sessões realizadas ({pkgSessions.length})</Label>
          <Button type="button" variant="outline" size="sm" onClick={addSession} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />Adicionar sessão
          </Button>
        </div>

        {pkgSessions.map((row, i) => (
          <div key={row.id} className="grid grid-cols-12 gap-2 p-2 rounded border bg-muted/20">
            <div className="col-span-1 flex items-center justify-center">
              <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
            </div>
            <div className="col-span-3">
              <Label className="text-[10px]">Data</Label>
              <Input type="date" value={row.date} onChange={(e) => updateSession(row.id, { date: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Hora</Label>
              <Input type="time" value={row.time} onChange={(e) => updateSession(row.id, { time: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Valor (R$)</Label>
              <Input type="text" value={row.amount_paid} onChange={(e) => updateSession(row.id, { amount_paid: e.target.value })} placeholder="opcional" className="h-8 text-xs" />
            </div>
            <div className="col-span-3">
              <Label className="text-[10px]">Pagamento em</Label>
              <Input type="date" value={row.payment_date} onChange={(e) => updateSession(row.id, { payment_date: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="col-span-1 flex items-end justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSession(row.id)} disabled={pkgSessions.length <= 1}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        <p className="text-[10px] text-muted-foreground">
          Dica: deixe "Valor (R$)" em branco nas sessões se você pagou o pacote inteiro de uma vez (use o "Valor total pago" acima).
        </p>
      </div>
    </div>
  );
}
