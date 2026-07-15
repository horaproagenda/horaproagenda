import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addMinutes, parse as parseDate, isValid as isValidDate } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { parseBrazilianCurrency } from '@/lib/utils';
import { useServices } from '@/hooks/useServices';
import { useProfessionals } from '@/hooks/useProfessionals';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useClientPackages } from '@/hooks/useClientPackages';
import { isClientCreditPaymentMethod } from '@/lib/clientCreditPayment';
import { getPackageAvailabilitySummary } from '@/lib/packageAvailability';

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
  const { clientPackages } = useClientPackages(clientId);

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
  const [linkExistingPackage, setLinkExistingPackage] = useState(false);
  const [existingPackageId, setExistingPackageId] = useState<string>('');
  const [confirmLinkKind, setConfirmLinkKind] = useState<'common' | 'sequential' | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);

  // CSV
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoadingFile(true);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (isPdf) {
        const pdfjs = await import('pdfjs-dist');
        // Use bundled worker via Vite ?url import
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
        const buf = await file.arrayBuffer();
        const doc = await (pdfjs as any).getDocument({ data: buf }).promise;
        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          // Group items by y position to reconstruct lines
          const rows = new Map<number, string[]>();
          for (const it of content.items as any[]) {
            const y = Math.round(it.transform[5]);
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y)!.push(it.str);
          }
          const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
          for (const y of sortedY) {
            const line = rows.get(y)!.join(' ').replace(/\s+/g, ' ').trim();
            if (line) text += line + '\n';
          }
        }
        setCsvText(text);
        toast.success(`PDF importado (${doc.numPages} páginas). Revise o texto antes de importar.`);
      } else {
        const text = await file.text();
        setCsvText(text);
        toast.success('Arquivo CSV carregado.');
      }
    } catch (err: any) {
      console.error('[LegacyHistory] file load error', err);
      toast.error(err?.message || 'Falha ao ler o arquivo');
    } finally {
      setLoadingFile(false);
    }
  };

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

  // Pacotes existentes do cliente compatíveis com a aba atual (comum/sequencial).
  const existingPackagesForTab = useMemo(() => {
    const kind = tab === 'sequential' ? 'sequential' : 'standard';
    const seen = new Set<string>();
    return (clientPackages || []).filter((p: any) => {
      const type = p.package_type === 'sequential' ? 'sequential' : 'standard';
      if (type !== kind) return false;
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      const summary = getPackageAvailabilitySummary(p);
      return summary.remainingSessions > 0;
    });
  }, [clientPackages, tab]);

  const existingPackageOptions = useMemo(
    () => existingPackagesForTab.map((p: any) => {
      const s = getPackageAvailabilitySummary(p);
      // "Disponíveis" no contexto de vincular histórico = sessões ainda não realizadas
      // (não consumidas), independentemente de agendamentos órfãos que possam ter ficado.
      return {
        value: p.id,
        label: p.name,
        sublabel: `${s.remainingSessions} de ${s.totalSessions} disponíveis`,
      };
    }),
    [existingPackagesForTab]
  );

  const selectedExistingPackage = useMemo(
    () => existingPackagesForTab.find((p: any) => p.id === existingPackageId),
    [existingPackagesForTab, existingPackageId]
  );

  const selectedExistingPackageSummary = useMemo(
    () => selectedExistingPackage ? getPackageAvailabilitySummary(selectedExistingPackage as any) : null,
    [selectedExistingPackage]
  );

  const existingPackagePendingSessions = useMemo(() => {
    if (!selectedExistingPackage) return [] as any[];
    return ((selectedExistingPackage as any).appointments || [])
      .filter((s: any) => s.status !== 'completed' && s.status !== 'missed')
      .sort((a: any, b: any) => (a.sequence_order || a.session_number) - (b.sequence_order || b.session_number));
  }, [selectedExistingPackage]);

  // Total realmente disponível para vincular (inclui sessões virtuais quando o
  // pacote foi criado sem gerar package_appointments — comum em boleto parcelado).
  const existingPackageAvailableCount =
    selectedExistingPackageSummary?.remainingSessions ?? existingPackagePendingSessions.length;

  const existingPackageLinkedSessions = useMemo(() => {
    if (!selectedExistingPackage) return [] as any[];
    return ((selectedExistingPackage as any).appointments || [])
      .filter((s: any) => s.status === 'completed' && s.appointment_id)
      .sort((a: any, b: any) => (a.sequence_order || a.session_number) - (b.sequence_order || b.session_number));
  }, [selectedExistingPackage]);


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
    status?: string;
    // Optional payment fields — passed to the edge function so the payment is
    // stamped atomically with the appointment (avoids RLS/race issues on a
    // separate client-side update path).
    amount_paid?: number;
    payment_status?: 'pending' | 'partial' | 'paid';
    payment_date?: string | null;
    payment_methods?: string[];
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
        status: params.status || 'completed',
        package_appointment_id: params.package_appointment_id || null,
        legacy: true,
        amount_paid: params.amount_paid,
        payment_status: params.payment_status,
        payment_date: params.payment_date,
        payment_methods: params.payment_methods,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      const msg = json.errors?.map((e: any) => e.message).join(', ') || json.error || 'Falha ao criar agendamento';
      throw new Error(msg);
    }
    return json.data;
  };

  const selectedPaymentMethodName = useMemo(() => {
    const found = (paymentMethods || []).find((m: any) => m.id === paymentMethodId);
    return found?.name || '';
  }, [paymentMethods, paymentMethodId]);
  const isCreditPayment = isClientCreditPaymentMethod(selectedPaymentMethodName);

  const createFinancialEntry = async (params: {
    amount: number;
    payment_date: string; // yyyy-mm-dd
    description: string;
    appointment_id?: string | null;
  }) => {
    if (!params.amount || !params.payment_date) return;
    const { data: { user } } = await supabase.auth.getUser();

    // 0) Sync payment fields onto the appointment itself so it shows up in
    //    "Histórico de Pagamentos" (which is built from appointments.amount_paid).
    //    We READ BACK the row and, if the update didn't stick (RLS silent
    //    filter, auto-heal race, etc.), we abort loudly instead of leaving the
    //    appointment as pending/R$ 0.
    if (params.appointment_id) {
      const methodName = selectedPaymentMethodName || null;
      const { error: aptErr } = await supabase
        .from('appointments')
        .update({
          amount_paid: params.amount,
          payment_status: 'paid',
          payment_date: params.payment_date,
          payment_methods: methodName ? [methodName] : [],
        })
        .eq('id', params.appointment_id);
      if (aptErr) throw aptErr;

      const { data: verify, error: verifyErr } = await supabase
        .from('appointments')
        .select('amount_paid, payment_status')
        .eq('id', params.appointment_id)
        .maybeSingle();
      if (verifyErr) throw verifyErr;
      if (!verify || Number(verify.amount_paid || 0) <= 0) {
        console.error('[LegacyHistory] appointment payment did not persist', {
          appointment_id: params.appointment_id,
          expected: params.amount,
          got: verify,
        });
        throw new Error(
          'Não foi possível registrar o pagamento no agendamento. Tente novamente ou verifique suas permissões.'
        );
      }
    }

    // 1) Financial entry — always created when payment method is client credit
    //    (so the payment appears in the client's financial history), or when the
    //    "lançar no financeiro" toggle is on for other methods.
    if (createFinancial || isCreditPayment) {
      const { error } = await supabase.from('financial_entries').insert({
        type: 'receivable',
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

      // 1b) Also register a cash_transactions row when there is an open cash
      //     register and the method is not client credit — otherwise the
      //     payment shows in "Financeiro" but is missing in "Caixa".
      if (!isCreditPayment) {
        const { data: openCash } = await supabase
          .from('cash_registers')
          .select('id')
          .eq('status', 'open')
          .maybeSingle();
        if (openCash?.id) {
          await supabase.from('cash_transactions').insert({
            cash_register_id: openCash.id,
            type: 'income',
            category: 'Baixa retroativa (histórico)',
            description: params.description,
            amount: params.amount,
            payment_method: selectedPaymentMethodName || paymentMethodId,
            reference_id: params.appointment_id || null,
            reference_type: params.appointment_id ? 'appointment' : null,
            created_by: user?.id,
          });
        }
      }
    }

    // 2) When paying with "Crédito ao Cliente", debit the client's credit
    //    balance and register a credit_used transaction so the profile stays
    //    consistent — mirrors the behavior of Caixa/SaleForm.
    if (isCreditPayment) {
      const { data: cli, error: cliErr } = await supabase
        .from('clients')
        .select('credit_balance')
        .eq('id', clientId)
        .maybeSingle();
      if (cliErr) throw cliErr;
      const currentBalance = Number(cli?.credit_balance || 0);
      const newBalance = Math.max(0, currentBalance - params.amount);

      const { error: updErr } = await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', clientId);
      if (updErr) throw updErr;

      const { error: txErr } = await (supabase as any)
        .from('client_credit_transactions')
        .insert({
          client_id: clientId,
          transaction_type: 'credit_used',
          amount: params.amount,
          previous_balance: currentBalance,
          new_balance: newBalance,
          description: `Uso de crédito (histórico): ${params.description}`,
          appointment_id: params.appointment_id || null,
          professional_id: professionalId || null,
          created_by: user?.id,
        });
      if (txErr) throw txErr;
    }
  };


  const invalidateAll = async () => {
    // Base — agendamentos e pacotes
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['client-appointments'] });
    qc.invalidateQueries({ queryKey: ['client-appointments', clientId] });
    qc.invalidateQueries({ queryKey: ['client_profile', clientId] });
    qc.invalidateQueries({ queryKey: ['service_packages'] });
    qc.invalidateQueries({ queryKey: ['client_packages'] });
    qc.invalidateQueries({ queryKey: ['client_packages', clientId] });
    qc.invalidateQueries({ queryKey: ['client_packages_with_counts', clientId] });
    qc.invalidateQueries({ queryKey: ['package_appointments'] });
    qc.invalidateQueries({ queryKey: ['package_details'] });
    qc.invalidateQueries({ queryKey: ['client-pending-package-sessions', clientId] });

    // Financeiro / caixa / vendas — garante que "Histórico de Pagamentos",
    // "Financeiro" e "Caixa" reflitam a baixa retroativa imediatamente.
    qc.invalidateQueries({ queryKey: ['financial_entries'] });
    qc.invalidateQueries({ queryKey: ['cash_transactions'] });
    qc.invalidateQueries({ queryKey: ['cash_registers'] });
    qc.invalidateQueries({ queryKey: ['single_sales'] });
    qc.invalidateQueries({ queryKey: ['client-sales', clientId] });
    qc.invalidateQueries({ queryKey: ['boleto_installments'] });
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    qc.invalidateQueries({ queryKey: ['financial-dashboard'] });

    // Crédito e cliente
    qc.invalidateQueries({ queryKey: ['client_credit_transactions', clientId] });
    qc.invalidateQueries({ queryKey: ['client_credits', clientId] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['client', clientId] });

    // Força refetch imediato das views que o usuário verá logo após o registro
    // (perfil do cliente, financeiro e caixa) — não apenas marca como stale.
    await Promise.allSettled([
      qc.refetchQueries({ queryKey: ['client-appointments', clientId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['client-sales', clientId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['client_packages', clientId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['financial_entries'], type: 'active' }),
      qc.refetchQueries({ queryKey: ['cash_transactions'], type: 'active' }),
      qc.refetchQueries({ queryKey: ['cash_registers'], type: 'active' }),
    ]);
  };

  // ============ SINGLE ============
  const handleSubmitSingle = async () => {
    if (!singleDate || !singleTime) { toast.error('Informe data e horário'); return; }
    const start = buildLocalISO(singleDate, singleTime);
    if (!start) { toast.error('Data/horário inválidos'); return; }
    const dur = parseInt(singleDuration) || (selectedService?.duration ?? 60);
    const end = new Date(new Date(start).getTime() + dur * 60_000).toISOString();

    // Validate payment fields cohesively — avoids silent losses where the user
    // fills only part of the payment info and the appointment ends up as
    // "pending / R$ 0" (invisible in Histórico de Pagamentos).
    const amount = parseBrazilianCurrency(singleAmount);
    const hasAnyPaymentInfo = !!singleAmount.trim() || !!paymentMethodId || !!singlePaymentDate;
    if (hasAnyPaymentInfo) {
      if (amount <= 0) {
        toast.error('Informe o valor pago (maior que zero) para registrar o pagamento.');
        return;
      }
      if (!paymentMethodId) {
        toast.error('Selecione a forma de pagamento para registrar o pagamento.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const methodName = selectedPaymentMethodName || null;
      const apt = await createLegacyAppointment({
        start_time: start,
        end_time: end,
        service_id: serviceId || null,
        professional_id: professionalId || null,
        notes: singleNotes,
        // Stamp payment atomically at creation — avoids relying solely on a
        // client-side UPDATE that could be blocked/reverted by RLS or races.
        amount_paid: amount > 0 ? amount : undefined,
        payment_status: amount > 0 ? 'paid' : undefined,
        payment_date: amount > 0 ? (singlePaymentDate || singleDate) : undefined,
        payment_methods: amount > 0 && methodName ? [methodName] : undefined,
      });
      if (amount > 0) {
        await createFinancialEntry({
          amount,
          payment_date: singlePaymentDate || singleDate,
          description: `${selectedService?.name || 'Atendimento'} — ${clientName} (Histórico)`,
          appointment_id: apt?.id || null,
        });
      }
      await invalidateAll();
      toast.success(
        amount > 0
          ? 'Agendamento histórico e pagamento cadastrados!'
          : 'Agendamento histórico cadastrado (sem pagamento).'
      );
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

  // ============ VINCULAR SESSÕES REALIZADAS A PACOTE EXISTENTE ============
  const handleSubmitLinkedPackage = async (kind: 'common' | 'sequential') => {
    if (!existingPackageId || !selectedExistingPackage) {
      toast.error('Selecione o pacote existente do cliente');
      return;
    }
    const filledSessions = pkgSessions.filter((r) => r.date && r.time);
    if (filledSessions.length === 0) {
      toast.error('Preencha ao menos uma sessão realizada com data e horário');
      return;
    }
    const available = existingPackageAvailableCount;
    if (filledSessions.length > available) {
      toast.error(`O pacote tem apenas ${available} sessão(ões) disponível(is). Reduza as sessões preenchidas.`);
      return;
    }

    const pkgAny: any = selectedExistingPackage;
    const pkgServiceId = pkgAny.service_id || null;
    const pkgDuration = pkgAny.duration || 60;
    const pkgName = pkgAny.name || 'Pacote';
    const pkgProfessionalId = pkgAny.professional_id || null;
    const effectiveProfessionalId = pkgProfessionalId || professionalId || null;

    setSubmitting(true);
    const toastId = toast.loading(`Vinculando ${filledSessions.length} sessão(ões)…`);
    // Rastreia PAs criadas/tocadas para permitir rollback se algo falhar.
    const createdPaIds: string[] = [];
    const touchedPaIds: string[] = [];
    const createdAptIds: string[] = [];
    try {
      // 1) Garante package_appointments suficientes (pacotes de boleto parcelado
      //    podem não ter gerado registros).
      let pendingList: any[] = [...existingPackagePendingSessions];
      const missing = filledSessions.length - pendingList.length;
      if (missing > 0) {
        const allSessions = (pkgAny.appointments || []);
        const maxNum = allSessions.reduce((m: number, s: any) => Math.max(m, s.session_number || 0, s.sequence_order || 0), 0);
        const toInsert = Array.from({ length: missing }).map((_, k) => {
          const n = maxNum + k + 1;
          const row: any = {
            package_id: pkgAny.id,
            session_number: n,
            original_session_number: n,
            status: 'pending',
            service_id: pkgServiceId,
          };
          if (kind === 'sequential') {
            row.sequence_order = n;
            row.interval_after_days = pkgAny.interval_days || 0;
          }
          return row;
        });
        const { data: inserted, error: insErr } = await supabase
          .from('package_appointments')
          .insert(toInsert)
          .select();
        if (insErr) throw insErr;
        (inserted || []).forEach((r: any) => createdPaIds.push(r.id));
        pendingList = [...pendingList, ...(inserted || [])];
      }

      // 2) Cria os agendamentos PRIMEIRO (paralelizado). Só depois marcamos as
      //    package_appointments como completed. Isso evita o bug de "1/14
      //    realizada" fantasma quando o edge function falha no meio.
      const results = await Promise.all(
        filledSessions.map(async (row, i) => {
          const pending = pendingList[i];
          const start = buildLocalISO(row.date, row.time);
          if (!start) return null;
          const dur = parseInt(row.duration) || pkgDuration;
          const end = new Date(new Date(start).getTime() + dur * 60_000).toISOString();
          const stepServiceId = pending.service_id || pkgServiceId;

          const apt = await createLegacyAppointment({
            start_time: start,
            end_time: end,
            service_id: stepServiceId,
            professional_id: effectiveProfessionalId,
            package_appointment_id: pending.id,
            notes: row.notes || `Sessão ${pending.session_number} — ${pkgName}`,
          });
          createdAptIds.push(apt.id);
          return { pending, apt, start };
        })
      );

      // 3) Marca as PAs como completed apontando para o apt criado — em lote.
      await Promise.all(
        results.filter(Boolean).map(async (r: any) => {
          const { error: updErr } = await supabase
            .from('package_appointments')
            .update({ status: 'completed', scheduled_date: r.start, appointment_id: r.apt.id })
            .eq('id', r.pending.id);
          if (updErr) throw updErr;
          touchedPaIds.push(r.pending.id);
        })
      );

      await invalidateAll();
      toast.success(
        `${filledSessions.length} sessão(ões) vinculada(s). ${available - filledSessions.length} continuam disponíveis.`,
        { id: toastId }
      );
      resetPackage();
      onOpenChange(false);
    } catch (e: any) {
      // Rollback best-effort: apaga agendamentos criados e reverte PAs.
      try {
        if (createdAptIds.length > 0) {
          await supabase.from('appointments').delete().in('id', createdAptIds);
        }
        if (touchedPaIds.length > 0) {
          await supabase
            .from('package_appointments')
            .update({ status: 'pending', scheduled_date: null, appointment_id: null })
            .in('id', touchedPaIds);
        }
        if (createdPaIds.length > 0) {
          await supabase.from('package_appointments').delete().in('id', createdPaIds);
        }
      } catch (rollbackErr) {
        console.error('[LegacyHistory] rollback error', rollbackErr);
      }
      toast.error(e.message || 'Falha ao vincular sessões ao pacote', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPackage = async (kind: 'common' | 'sequential') => {
    if (linkExistingPackage) return handleSubmitLinkedPackage(kind);
    if (!serviceId) { toast.error('Selecione o serviço base do pacote'); return; }
    const total = parseInt(pkgTotalSessions) || pkgSessions.length;
    if (total < 1) { toast.error('Total de sessões inválido'); return; }
    // Considera apenas as linhas efetivamente preenchidas (data + hora)
    const filledSessions = pkgSessions.filter((r) => r.date && r.time);
    if (filledSessions.length === 0) {
      toast.error('Preencha pelo menos uma sessão com data e horário');
      return;
    }
    if (filledSessions.length > total) {
      toast.error(`Você preencheu ${filledSessions.length} sessões, mas o total do pacote é ${total}. Aumente o total ou remova sessões.`);
      return;
    }
    const remainingSessions = Math.max(0, total - filledSessions.length);
    const totalPrice = parseBrazilianCurrency(pkgTotalPrice);
    // Nome do pacote é derivado automaticamente do serviço selecionado
    const derivedPkgName = `${selectedService?.name || 'Pacote'} — ${total} sessões`;

    setSubmitting(true);
    const toastId = toast.loading(`Cadastrando pacote com ${filledSessions.length} sessão(ões)…`);
    let createdPkgId: string | null = null;
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
          sessions_scheduled: filledSessions.length,
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
      createdPkgId = pkg.id;

      // 2. Cria as PAs como 'pending' e depois cria os appointments em paralelo.
      //    Só marcamos como 'completed' após o agendamento existir — evita PA
      //    fantasma "1/N realizada" quando a edge function falha.
      const paRows = filledSessions.map((row, i) => {
        const start = buildLocalISO(row.date, row.time);
        const dur = parseInt(row.duration) || (selectedService?.duration ?? 60);
        const end = start ? new Date(new Date(start).getTime() + dur * 60_000).toISOString() : null;
        const paInsert: any = {
          package_id: pkg.id,
          session_number: i + 1,
          original_session_number: i + 1,
          status: 'pending',
          scheduled_date: start,
          service_id: serviceId,
        };
        if (kind === 'sequential') {
          paInsert.sequence_order = i + 1;
          paInsert.interval_after_days = i < filledSessions.length - 1 ? (parseInt(pkgIntervalDays) || 30) : 0;
        }
        return { row, start, end, paInsert, index: i };
      }).filter((r) => r.start && r.end);

      const { data: insertedPas, error: paBulkErr } = await supabase
        .from('package_appointments')
        .insert(paRows.map((r) => r.paInsert))
        .select();
      if (paBulkErr) throw paBulkErr;

      const results = await Promise.all(
        paRows.map(async (r, idx) => {
          const pa = insertedPas![idx];
          const apt = await createLegacyAppointment({
            start_time: r.start!,
            end_time: r.end!,
            service_id: serviceId,
            professional_id: professionalId || null,
            package_appointment_id: pa.id,
            notes: r.row.notes || `Sessão ${r.index + 1}/${total} — ${derivedPkgName}`,
          });
          return { pa, apt, row: r.row, index: r.index };
        })
      );

      // Marca todas como completed + linka appointment_id
      await Promise.all(
        results.map(({ pa, apt }) =>
          supabase
            .from('package_appointments')
            .update({ status: 'completed', appointment_id: apt.id })
            .eq('id', pa.id)
        )
      );

      // Lançamentos financeiros por sessão (opcional)
      for (const { row, apt, index } of results) {
        const amt = parseBrazilianCurrency(row.amount_paid);
        if (amt > 0) {
          await createFinancialEntry({
            amount: amt,
            payment_date: row.payment_date || row.date,
            description: `Sessão ${index + 1}/${total} — ${derivedPkgName} (Histórico)`,
            appointment_id: apt.id,
          });
        }
      }

      // 2b. Cria placeholders 'pending' para as sessões restantes do pacote
      // (ex.: pacote de 10 com apenas 5 realizadas → 5 ficam disponíveis para agendamento futuro)
      if (remainingSessions > 0) {
        const placeholders = Array.from({ length: remainingSessions }).map((_, k) => {
          const idx = filledSessions.length + k;
          const row: any = {
            package_id: pkg.id,
            session_number: idx + 1,
            original_session_number: idx + 1,
            status: 'pending',
            service_id: serviceId,
          };
          if (kind === 'sequential') {
            row.sequence_order = idx + 1;
            row.interval_after_days = k < remainingSessions - 1 ? (parseInt(pkgIntervalDays) || 30) : 0;
          }
          return row;
        });
        const { error: placeholderErr } = await supabase
          .from('package_appointments')
          .insert(placeholders);
        if (placeholderErr) throw placeholderErr;
      }

      // 3. Single financial entry for total package payment (if no per-session amounts and total > 0)
      const anyPerSession = filledSessions.some((r) => parseBrazilianCurrency(r.amount_paid) > 0);
      if (totalPrice > 0 && !anyPerSession) {
        await createFinancialEntry({
          amount: totalPrice,
          payment_date: pkgPaymentDate || filledSessions[0].date,
          description: `Pacote ${derivedPkgName} — ${clientName} (Histórico)`,
        });
      }


      await invalidateAll();
      toast.success(`Pacote ${kind === 'sequential' ? 'sequencial' : 'comum'} histórico cadastrado!`, { id: toastId });
      resetPackage();
      onOpenChange(false);
    } catch (e: any) {
      // Rollback: apaga pacote inteiro (cascata cuida das PAs e appointments
      // vinculados) para não deixar "1/N realizada" fantasma.
      if (createdPkgId) {
        try {
          const { data: pas } = await supabase
            .from('package_appointments')
            .select('appointment_id')
            .eq('package_id', createdPkgId);
          const aptIds = (pas || []).map((p: any) => p.appointment_id).filter(Boolean);
          if (aptIds.length > 0) {
            await supabase.from('appointments').delete().in('id', aptIds);
          }
          await supabase.from('package_appointments').delete().eq('package_id', createdPkgId);
          await supabase.from('service_packages').delete().eq('id', createdPkgId);
        } catch (rbErr) {
          console.error('[LegacyHistory] rollback pkg error', rbErr);
        }
      }
      toast.error(e.message || 'Falha ao cadastrar pacote histórico', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const resetPackage = () => {
    setPkgName(''); setPkgTotalSessions('4'); setPkgTotalPrice(''); setPkgPaymentDate('');
    setPkgIntervalDays('30');
    setPkgSessions([newSessionRow(), newSessionRow()]);
    setLinkExistingPackage(false);
    setExistingPackageId('');
  };

  // ============ DESFAZER VÍNCULO ============
  // Restaura a sessão para pending, remove agendamento retroativo e lançamentos financeiros gerados.
  const handleUndoLink = async (packageAppointmentId: string) => {
    const linked = existingPackageLinkedSessions.find((s: any) => s.id === packageAppointmentId);
    if (!linked) { toast.error('Sessão não encontrada'); return; }
    const appointmentId = linked.appointment_id;
    setSubmitting(true);
    try {
      if (appointmentId) {
        // 1) Remove lançamentos financeiros gerados a partir desse agendamento
        const { error: feErr } = await supabase
          .from('financial_entries')
          .delete()
          .eq('appointment_id', appointmentId);
        if (feErr) throw feErr;

        // 2) Remove o agendamento retroativo
        const { error: apErr } = await supabase
          .from('appointments')
          .delete()
          .eq('id', appointmentId);
        if (apErr) throw apErr;
      }

      // 3) Restaura a sessão do pacote para o estado disponível
      const { error: paErr } = await supabase
        .from('package_appointments')
        .update({ status: 'pending', scheduled_date: null, appointment_id: null })
        .eq('id', packageAppointmentId);
      if (paErr) throw paErr;

      await invalidateAll();
      toast.success('Vínculo desfeito. A sessão voltou a ficar disponível para agendamento.');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao desfazer o vínculo');
    } finally {
      setSubmitting(false);
      setConfirmUnlinkId(null);
    }
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
    if (!csvText.trim()) { toast.error('Cole o conteúdo do CSV/PDF'); return; }
    setSubmitting(true);
    setCsvResult(null);
    const errors: string[] = [];
    let success = 0; let failed = 0;

    const norm = (s: string) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const parseBrDate = (s: string): string | null => {
      const cleaned = (s || '').trim();
      if (!cleaned) return null;
      // DD/MM/YYYY or DD-MM-YYYY
      const dmy = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
      if (dmy) {
        let [, d, m, y] = dmy;
        let yy = parseInt(y); if (yy < 100) yy += 2000;
        const dd = parseInt(d), mm = parseInt(m);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
      const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
      for (const fmt of ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy']) {
        try {
          const d = parseDate(cleaned, fmt, new Date());
          if (isValidDate(d)) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
        } catch {}
      }
      return null;
    };

    const parseTime = (s: string): string | null => {
      const m = (s || '').match(/(\d{1,2})[:h](\d{2})/);
      if (!m) return null;
      const hh = parseInt(m[1]), mm = parseInt(m[2]);
      if (hh > 23 || mm > 59) return null;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    const mapStatus = (raw: string): string => {
      const n = norm(raw);
      if (!n) return 'completed';
      if (/(atend|conclu|realiz|finaliz|feit|complet|pago)/.test(n)) return 'completed';
      if (/(cancel)/.test(n)) return 'cancelled';
      if (/(falt|no.?show|ausen)/.test(n)) return 'no_show';
      if (/(confirm)/.test(n)) return 'confirmed';
      if (/(agend|schedul|pend)/.test(n)) return 'scheduled';
      return 'completed';
    };

    // Row = list of parsed fields regardless of source (CSV, tab-delimited, PDF text)
    interface Row {
      date?: string; time?: string; endTime?: string; duration?: string;
      service?: string; professional?: string; amount?: string;
      paymentDate?: string; notes?: string; status?: string;
    }

    const rawLines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rawLines.length === 0) throw new Error('Arquivo vazio');

    // Detect the best delimiter across the file
    const detectDelim = (line: string): string => {
      const counts: Record<string, number> = {
        ';': (line.match(/;/g) || []).length,
        '\t': (line.match(/\t/g) || []).length,
        '|': (line.match(/\|/g) || []).length,
        ',': (line.match(/,/g) || []).length,
      };
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return best[1] > 0 ? best[0] : '';
    };
    const delim = detectDelim(rawLines[0]);

    const rows: Row[] = [];

    try {
      if (delim) {
        // ---------- Delimited (CSV/TSV) ----------
        const splitLine = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
        const headers = splitLine(rawLines[0]).map(norm);

        const findCol = (...aliases: string[]): number => {
          for (const a of aliases) {
            const i = headers.findIndex((h) => h === a);
            if (i >= 0) return i;
          }
          for (const a of aliases) {
            const i = headers.findIndex((h) => h.includes(a));
            if (i >= 0) return i;
          }
          return -1;
        };

        const cDate = findCol('data', 'dia', 'date');
        const cTime = findCol('hora inicio', 'horario inicio', 'inicio', 'horario', 'hora', 'start');
        const cEnd = findCol('hora fim', 'horario fim', 'termino', 'fim', 'end');
        const cDur = findCol('duracao', 'duration', 'dur', 'tempo');
        const cSvc = findCol('servico', 'atendimento', 'procedimento', 'service');
        const cProf = findCol('profissional', 'profission', 'colaborador', 'professional');
        const cAmt = findCol('valor pago', 'valor', 'preco', 'amount', 'total');
        const cPay = findCol('data pagamento', 'pagamento', 'paid', 'data_pagamento');
        const cNotes = findCol('observacoes', 'observacao', 'obs', 'notes');
        const cStatus = findCol('status', 'situacao');

        // If the first line looks like data (no date-keyword, but starts with a date), treat it as data
        const looksLikeHeader = cDate >= 0 || cTime >= 0 || cSvc >= 0 || cStatus >= 0;
        const startIdx = looksLikeHeader ? 1 : 0;

        for (let i = startIdx; i < rawLines.length; i++) {
          const cols = splitLine(rawLines[i]);
          // Fallback: scan any column for date/time if headers missing
          const scanForDate = () => cols.map(parseBrDate).find(Boolean) || undefined;
          const scanForTime = () => cols.map(parseTime).find(Boolean) || undefined;

          rows.push({
            date: cDate >= 0 ? parseBrDate(cols[cDate] || '') || undefined : scanForDate(),
            time: cTime >= 0 ? parseTime(cols[cTime] || '') || undefined : scanForTime(),
            endTime: cEnd >= 0 ? parseTime(cols[cEnd] || '') || undefined : undefined,
            duration: cDur >= 0 ? cols[cDur] : undefined,
            service: cSvc >= 0 ? cols[cSvc] : undefined,
            professional: cProf >= 0 ? cols[cProf] : undefined,
            amount: cAmt >= 0 ? cols[cAmt] : undefined,
            paymentDate: cPay >= 0 ? parseBrDate(cols[cPay] || '') || undefined : undefined,
            notes: cNotes >= 0 ? cols[cNotes] : undefined,
            status: cStatus >= 0 ? cols[cStatus] : undefined,
          });
        }
      } else {
        // ---------- Free text (PDF) — extract date + times per line ----------
        const dateRe = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/;
        const timeRe = /(\d{1,2}[:h]\d{2})/g;
        const statusRe = /\b(atendid[oa]|conclu[ií]d[oa]|realizad[oa]|cancelad[oa]|faltou|no.?show|ausente|agendad[oa]|confirmad[oa]|pend\w*)/i;
        const moneyRe = /R?\$?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2}))/;

        // Padrões de linhas de cabeçalho/metadados de PDF que devem ser ignoradas
        const noiseRe = /^(hist[oó]rico|cliente\s*:|cpf\s*:|data de emiss[aã]o|servi[cç]o\s+data\s+hor[aá]rio|p[aá]gina|telefone\s*:|endere[cç]o\s*:|profissional\s*:|per[ií]odo\s*:)/i;

        for (const line of rawLines) {
          if (noiseRe.test(line)) continue;

          const dMatch = line.match(dateRe);
          if (!dMatch) continue;
          const date = parseBrDate(dMatch[1]);
          if (!date) continue;

          const times = [...line.matchAll(timeRe)].map((m) => parseTime(m[1])).filter(Boolean) as string[];
          const time = times[0];
          let endTime = times[1];
          if (!time) continue;

          // Descarta linhas que parecem "Data de emissão: dd/mm/aaaa as hh:mm" (só 1 horário e sem status/serviço)
          const sMatch = line.match(statusRe);
          const mMatch = line.match(moneyRe);
          if (!sMatch && times.length < 2 && /emiss[aã]o|gerado|impress[aã]o/i.test(line)) continue;

          // Service = the remaining text with dates/times/status/money stripped out
          let service = line
            .replace(dateRe, ' ')
            .replace(timeRe, ' ')
            .replace(statusRe, ' ')
            .replace(moneyRe, ' ')
            .replace(/\s*[-–—]\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          rows.push({
            date, time, endTime,
            service: service || undefined,
            amount: mMatch ? mMatch[0] : undefined,
            status: sMatch ? sMatch[1] : undefined,
          });
        }

        if (rows.length === 0) {
          throw new Error('Não foi possível extrair data e horário do arquivo. Verifique o formato ou use o modelo CSV.');
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (!row.date) throw new Error('data ausente');
          if (!row.time) throw new Error('horário ausente');

          const start = buildLocalISO(row.date, row.time);
          if (!start) throw new Error('data/hora inválidas');

          let endIso: string;
          if (row.endTime) {
            const e = buildLocalISO(row.date, row.endTime);
            endIso = e && new Date(e) > new Date(start) ? e : new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
          } else {
            const dur = parseInt((row.duration || '').replace(/\D/g, '')) || (selectedService as any)?.duration || 60;
            endIso = new Date(new Date(start).getTime() + dur * 60_000).toISOString();
          }

          const matchedSvc = row.service
            ? services.find((s: any) => norm(s.name) === norm(row.service!)) ||
              services.find((s: any) => norm(s.name).includes(norm(row.service!)) || norm(row.service!).includes(norm(s.name)))
            : null;
          const matchedProf = row.professional
            ? professionals.find((p: any) => norm(p.name) === norm(row.professional!)) ||
              professionals.find((p: any) => norm(p.name).includes(norm(row.professional!)))
            : null;

          const status = mapStatus(row.status || '');

          const apt = await createLegacyAppointment({
            start_time: start,
            end_time: endIso,
            service_id: matchedSvc?.id || serviceId || null,
            professional_id: matchedProf?.id || professionalId || null,
            notes: row.notes || '',
            status,
          });

          const amt = row.amount ? parseBrazilianCurrency(row.amount) : 0;
          const payDate = row.paymentDate || row.date;
          if (amt > 0 && status === 'completed') {
            await createFinancialEntry({
              amount: amt,
              payment_date: payDate,
              description: `${matchedSvc?.name || row.service || 'Atendimento'} — ${clientName} (Histórico)`,
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
      await invalidateAll();
      if (success > 0) toast.success(`${success} registros importados`);
      if (failed > 0) toast.error(`${failed} linhas com erro`);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao processar arquivo');
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

          {/* Shared selectors — ao vincular a um pacote já cadastrado (venda já feita),
              serviço/forma de pagamento/lançamento no financeiro são omitidos para não
              duplicar registros. Profissional só aparece se o pacote não tiver um. */}
          {(() => {
            const isLinkingExisting = (tab === 'common' || tab === 'sequential') && linkExistingPackage;
            const pkgHasProfessional = !!(selectedExistingPackage as any)?.professional_id;
            const showService = !isLinkingExisting;
            const showPaymentMethod = !isLinkingExisting;
            const showFinancialToggle = !isLinkingExisting;
            const showProfessional = !isLinkingExisting || !pkgHasProfessional;
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                  {showService && (
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
                  )}
                  {showProfessional && (
                    <div>
                      <Label className="text-[10px]">Profissional{isLinkingExisting ? ' (pacote sem profissional definido)' : ''}</Label>
                      <SearchableSelect
                        options={profOptions}
                        value={professionalId}
                        onChange={setProfessionalId}
                        placeholder="Selecione o profissional"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  {showPaymentMethod && (
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
                  )}
                </div>

                {showFinancialToggle && (
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Switch id="legacy-fin" checked={createFinancial} onCheckedChange={setCreateFinancial} />
                    <Label htmlFor="legacy-fin" className="cursor-pointer">Lançar pagamentos no financeiro com data retroativa</Label>
                  </div>
                )}

                {isLinkingExisting && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Esse pacote já tem venda registrada. Informamos apenas as datas das aplicações realizadas — nenhum lançamento financeiro adicional é criado.
                  </p>
                )}
              </>
            );
          })()}


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
                pkgTotalSessions={pkgTotalSessions} setPkgTotalSessions={setPkgTotalSessions}
                pkgTotalPrice={pkgTotalPrice} setPkgTotalPrice={setPkgTotalPrice}
                pkgPaymentDate={pkgPaymentDate} setPkgPaymentDate={setPkgPaymentDate}
                pkgSessions={pkgSessions}
                addSession={addSession} removeSession={removeSession} updateSession={updateSession}
                linkExistingPackage={linkExistingPackage} setLinkExistingPackage={setLinkExistingPackage}
                existingPackageId={existingPackageId} setExistingPackageId={setExistingPackageId}
                existingPackageOptions={existingPackageOptions}
                existingPackageAvailable={existingPackageAvailableCount}
                linkedSessions={existingPackageLinkedSessions}
                onRequestUndoLink={(id) => setConfirmUnlinkId(id)}
              />
            </TabsContent>

            <TabsContent value="sequential" className="mt-0">
              <PackageForm
                kind="sequential"
                pkgTotalSessions={pkgTotalSessions} setPkgTotalSessions={setPkgTotalSessions}
                pkgTotalPrice={pkgTotalPrice} setPkgTotalPrice={setPkgTotalPrice}
                pkgPaymentDate={pkgPaymentDate} setPkgPaymentDate={setPkgPaymentDate}
                pkgIntervalDays={pkgIntervalDays} setPkgIntervalDays={setPkgIntervalDays}
                pkgSessions={pkgSessions}
                addSession={addSession} removeSession={removeSession} updateSession={updateSession}
                linkExistingPackage={linkExistingPackage} setLinkExistingPackage={setLinkExistingPackage}
                existingPackageId={existingPackageId} setExistingPackageId={setExistingPackageId}
                existingPackageOptions={existingPackageOptions}
                existingPackageAvailable={existingPackageAvailableCount}
                linkedSessions={existingPackageLinkedSessions}
                onRequestUndoLink={(id) => setConfirmUnlinkId(id)}
              />
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 mt-0">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Cole o CSV ou selecione arquivo CSV/PDF. Cabeçalho esperado: <strong>data;hora;duracao_min;servico;profissional;valor_pago;data_pagamento;observacoes</strong>
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Baixar modelo
                </Button>
                <Button variant="outline" size="sm" onClick={() => document.getElementById('legacy-history-file')?.click()} disabled={loadingFile}>
                  {loadingFile ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Selecionar arquivo (CSV ou PDF)
                </Button>
                <input
                  id="legacy-history-file"
                  type="file"
                  accept=".csv,text/csv,.pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>
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
            <Button
              onClick={() => linkExistingPackage ? setConfirmLinkKind('common') : handleSubmitPackage('common')}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {linkExistingPackage ? 'Vincular sessões realizadas' : 'Cadastrar pacote comum'}
            </Button>
          )}
          {tab === 'sequential' && (
            <Button
              onClick={() => linkExistingPackage ? setConfirmLinkKind('sequential') : handleSubmitPackage('sequential')}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {linkExistingPackage ? 'Vincular sessões realizadas' : 'Cadastrar pacote sequencial'}
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

      {/* Confirmação antes de vincular sessões realizadas ao pacote existente */}
      <AlertDialog open={!!confirmLinkKind} onOpenChange={(o) => !o && setConfirmLinkKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vincular sessões realizadas?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Pacote: <strong>{selectedExistingPackage?.name}</strong>
                </p>
                {(() => {
                  const filled = pkgSessions.filter((r) => r.date && r.time).length;
                  const available = existingPackageAvailableCount;
                  const remaining = Math.max(0, available - filled);
                  return (
                    <>
                      <p>
                        <strong>{filled}</strong> sessão(ões) serão marcadas como <strong>realizadas</strong> (completed) com data retroativa.
                      </p>
                      <p>
                        <strong>{remaining}</strong> sessão(ões) continuarão <strong>disponíveis</strong> para agendamento futuro.
                      </p>
                      {filled > available && (
                        <p className="text-destructive">
                          Atenção: você preencheu mais sessões do que o pacote tem disponível ({available}). Reduza antes de confirmar.
                        </p>
                      )}
                    </>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Você poderá desfazer esse vínculo depois, restaurando as sessões para o estado disponível.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={async (e) => {
                e.preventDefault();
                const kind = confirmLinkKind;
                if (!kind) return;
                await handleSubmitPackage(kind);
                setConfirmLinkKind(null);
              }}
            >
              Confirmar vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação antes de desfazer vínculo */}
      <AlertDialog open={!!confirmUnlinkId} onOpenChange={(o) => !o && setConfirmUnlinkId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer vínculo desta sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão voltará ao estado <strong>disponível para agendamento</strong>. O agendamento retroativo e o lançamento financeiro vinculado serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={async (e) => {
                e.preventDefault();
                if (confirmUnlinkId) await handleUndoLink(confirmUnlinkId);
              }}
            >
              Desfazer vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ====== Sub-component: Package Form ======
interface PackageFormProps {
  kind: 'common' | 'sequential';
  pkgTotalSessions: string; setPkgTotalSessions: (v: string) => void;
  pkgTotalPrice: string; setPkgTotalPrice: (v: string) => void;
  pkgPaymentDate: string; setPkgPaymentDate: (v: string) => void;
  pkgIntervalDays?: string; setPkgIntervalDays?: (v: string) => void;
  pkgSessions: SessionRow[];
  addSession: () => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<SessionRow>) => void;
  linkExistingPackage: boolean;
  setLinkExistingPackage: (v: boolean) => void;
  existingPackageId: string;
  setExistingPackageId: (v: string) => void;
  existingPackageOptions: Array<{ value: string; label: string; sublabel?: string }>;
  existingPackageAvailable: number;
  linkedSessions: any[];
  onRequestUndoLink: (packageAppointmentId: string) => void;
}

function PackageForm(props: PackageFormProps) {
  const {
    kind, pkgTotalSessions, setPkgTotalSessions,
    pkgTotalPrice, setPkgTotalPrice, pkgPaymentDate, setPkgPaymentDate,
    pkgIntervalDays, setPkgIntervalDays, pkgSessions,
    addSession, removeSession, updateSession,
    linkExistingPackage, setLinkExistingPackage,
    existingPackageId, setExistingPackageId,
    existingPackageOptions, existingPackageAvailable,
    linkedSessions, onRequestUndoLink,
  } = props;

  const filled = pkgSessions.filter((r) => r.date && r.time).length;
  const totalNum = linkExistingPackage
    ? existingPackageAvailable
    : (parseInt(pkgTotalSessions) || pkgSessions.length);
  const remaining = Math.max(0, totalNum - filled);

  return (
    <div className="space-y-3">
      <div className="rounded border bg-muted/30 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Switch id={`link-existing-${kind}`} checked={linkExistingPackage} onCheckedChange={setLinkExistingPackage} />
          <Label htmlFor={`link-existing-${kind}`} className="text-xs cursor-pointer">
            Vincular a um pacote {kind === 'sequential' ? 'sequencial' : 'comum'} já cadastrado do cliente
          </Label>
        </div>
        {linkExistingPackage && (
          <div>
            <SearchableSelect
              options={existingPackageOptions}
              value={existingPackageId}
              onChange={setExistingPackageId}
              placeholder={existingPackageOptions.length === 0 ? `Nenhum pacote ${kind === 'sequential' ? 'sequencial' : 'comum'} com sessões disponíveis` : 'Selecione o pacote existente'}
              className="h-8 text-xs"
            />
            {existingPackageId && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {existingPackageAvailable} sessão(ões) disponível(is). As demais permanecerão liberadas para agendamento futuro.
              </p>
            )}
            {existingPackageId && linkedSessions.length > 0 && (
              <div className="mt-2 space-y-1 rounded border bg-background p-2">
                <div className="text-[11px] font-medium">
                  Sessões já vinculadas ({linkedSessions.length})
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Selecionou o pacote errado? Desfaça o vínculo para restaurar as sessões ao estado disponível.
                </p>
                {linkedSessions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-[11px] py-1 border-t first:border-t-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">#{s.session_number}</Badge>
                      <span className="text-muted-foreground">
                        {s.scheduled_date ? new Date(s.scheduled_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sem data'}
                      </span>
                    </div>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-6 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => onRequestUndoLink(s.id)}
                    >
                      Desfazer vínculo
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>


      {!linkExistingPackage && (
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
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs">Sessões realizadas ({filled} de {totalNum})</Label>
            {remaining > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {remaining} sessão(ões) {linkExistingPackage ? 'continuarão' : 'ficarão'} disponíveis para agendamento futuro.
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSession} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />Adicionar sessão
          </Button>
        </div>

        {pkgSessions.map((row, i) => (
          <div key={row.id} className="grid grid-cols-12 gap-2 p-2 rounded border bg-muted/20">
            <div className="col-span-1 flex items-center justify-center">
              <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
            </div>
            <div className={linkExistingPackage ? 'col-span-6' : 'col-span-3'}>
              <Label className="text-[10px]">Data</Label>
              <Input type="date" value={row.date} onChange={(e) => updateSession(row.id, { date: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className={linkExistingPackage ? 'col-span-4' : 'col-span-2'}>
              <Label className="text-[10px]">Hora</Label>
              <Input type="time" value={row.time} onChange={(e) => updateSession(row.id, { time: e.target.value })} className="h-8 text-xs" />
            </div>
            {!linkExistingPackage && (
              <>
                <div className="col-span-2">
                  <Label className="text-[10px]">Valor (R$)</Label>
                  <Input type="text" value={row.amount_paid} onChange={(e) => updateSession(row.id, { amount_paid: e.target.value })} placeholder="opcional" className="h-8 text-xs" />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Pagamento em</Label>
                  <Input type="date" value={row.payment_date} onChange={(e) => updateSession(row.id, { payment_date: e.target.value })} className="h-8 text-xs" />
                </div>
              </>
            )}
            <div className="col-span-1 flex items-end justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSession(row.id)} disabled={pkgSessions.length <= 1}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        {!linkExistingPackage && (
          <p className="text-[10px] text-muted-foreground">
            Dica: deixe "Valor (R$)" em branco nas sessões se você pagou o pacote inteiro de uma vez (use o "Valor total pago" acima).
          </p>
        )}

      </div>
    </div>
  );
}
