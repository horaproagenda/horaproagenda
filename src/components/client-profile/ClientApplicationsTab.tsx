import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useProfessionals } from '@/hooks/useProfessionals';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Plus, Trash2, Copy, Printer, Lock, Settings2 } from 'lucide-react';
import {
  ApplicationItemDraft, BASE_FIELDS, GUIDANCE_FIELDS, SIDE_OPTIONS, STATUS_LABEL, TemplateField, UNIT_OPTIONS,
  buildReferenceItems, emptyItem, parseQuantity, validateCompletion, REFERENCE_COPY_FIELD_PREFIXES,
} from '@/lib/applicationRecords';
import { applicationLocalInput, applicationDateLabel, isApplicationLocalDate } from '@/lib/applicationDates';

const db = supabase as any;

interface Template { id: string; name: string; slug: string; fields: TemplateField[]; version: number; account_owner_id: string | null; is_active: boolean }
interface RecordRow {
  id: string; client_id: string; professional_id: string | null; procedure_template_id: string | null; procedure_name: string;
  template_snapshot: { fields?: TemplateField[]; version?: number }; appointment_id: string | null; room: string | null; reason: string | null;
  status: string; updated_at: string; performed_at: string; follow_up_date: string | null; based_on_id: string | null; amends_id: string | null; amendment_reason: string | null;
  application_items?: (ApplicationItemDraft & { id: string; position: number; quantity: any })[];
  application_field_values?: { field_id: string; value: string }[];
}

const statusVariant = (s: string) => (s === 'completed' ? 'default' : s === 'cancelled' || s === 'amended' ? 'outline' : 'secondary') as any;
const toLocalInput = applicationLocalInput;

export function ClientApplicationsTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const receptionOnly = hasRole('receptionist') && !isAdmin && !hasRole('professional');
  const { professionalId: myProfId } = useCurrentProfessional();
  const { professionals } = useProfessionals();
  const profName = (id: string | null) => (professionals as any[])?.find((p) => p.id === id)?.name ?? '—';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [profFilter, setProfFilter] = useState('all');
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [viewing, setViewing] = useState<RecordRow | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['procedure_templates'],
    queryFn: async () => {
      const { data, error } = await db.from('procedure_templates').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as Template[];
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['application_records', clientId],
    queryFn: async () => {
      const sel = receptionOnly ? '*' : '*, application_items(*), application_field_values(field_id, value)';
      const { data, error } = await db.from('application_records').select(sel).eq('client_id', clientId).order('performed_at', { ascending: false });
      if (error) throw error;
      return data as RecordRow[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['application_records', clientId] });

  const filtered = useMemo(() => records.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (profFilter !== 'all' && r.professional_id !== profFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [r.procedure_name, profName(r.professional_id), ...(r.application_items ?? []).flatMap((i) => [i.region, i.product_name_snapshot])].join(' ').toLowerCase();
    return hay.includes(q);
  }), [records, search, statusFilter, profFilter, professionals]);

  const startNew = () => setEditing(newEditorState(myProfId ?? null));
  const startFromReference = (r: RecordRow) => {
    const st = newEditorState(myProfId ?? null);
    st.procedure_template_id = r.procedure_template_id;
    st.procedure_name = r.procedure_name;
    st.templateFields = r.template_snapshot?.fields ?? [];
    st.based_on_id = r.id;
    st.items = buildReferenceItems((r.application_items ?? []).sort((a, b) => a.position - b.position));
    (r.application_field_values ?? []).forEach((v) => { if (REFERENCE_COPY_FIELD_PREFIXES.includes(v.field_id)) st.values[v.field_id] = v.value; });
    setViewing(null);
    setEditing(st);
  };
  const startEdit = (r: RecordRow) => {
    setViewing(null);
    setEditing({
      id: r.id, updated_at: r.updated_at, appointment_id: r.appointment_id, professional_id: r.professional_id, procedure_template_id: r.procedure_template_id, procedure_name: r.procedure_name,
      templateFields: r.template_snapshot?.fields ?? [], templateVersion: r.template_snapshot?.version ?? 1, performed_at: toLocalInput(r.performed_at),
      room: r.room ?? '', reason: r.reason ?? '', follow_up_date: r.follow_up_date ?? '', based_on_id: r.based_on_id, status: r.status,
      items: (r.application_items ?? []).sort((a, b) => a.position - b.position).map((i) => ({
        product_id: i.product_id, product_name_snapshot: i.product_name_snapshot ?? '', manufacturer_snapshot: i.manufacturer_snapshot ?? '',
        lot_number: i.lot_number ?? '', expiration_date: i.expiration_date ?? '', region: i.region ?? '', side: i.side ?? '',
        quantity: i.quantity != null ? String(i.quantity) : '', unit: i.unit ?? 'ml', technique: i.technique ?? '', dilution: i.dilution ?? '',
        instrument: i.instrument ?? '', notes: i.notes ?? '' })),
      values: Object.fromEntries((r.application_field_values ?? []).map((v) => [v.field_id, v.value ?? ''])),
    });
  };

  const amend = async (r: RecordRow) => {
    const reason = window.prompt('Motivo da retificação (obrigatório):');
    if (!reason?.trim()) return;
    const { data, error } = await db.rpc('amend_application_record', { _id: r.id, _reason: reason.trim() });
    if (error || !data?.ok) { toast.error('Não foi possível retificar esta ficha.'); return; }
    toast.success('Retificação criada. A ficha original foi preservada.');
    setViewing(null);
    await refresh();
  };

  return (
    <div className="space-y-3">
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <Input placeholder="Buscar procedimento, região, produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full min-w-0 lg:max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={profFilter} onValueChange={setProfFilter}>
          <SelectTrigger className="w-full lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os profissionais</SelectItem>
            {(professionals as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex">
          {isAdmin && <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}><Settings2 className="mr-1 h-4 w-4" />Modelos</Button>}
          {!receptionOnly && <Button size="sm" onClick={startNew}><Plus className="mr-1 h-4 w-4" />Nova ficha</Button>}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <ClipboardList className="h-8 w-8" />
          <p className="text-sm">Nenhuma ficha de aplicação registrada.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const items = r.application_items ?? [];
            return (
              <Card key={r.id} className="min-w-0 cursor-pointer break-words p-3 transition-colors hover:bg-muted/40" onClick={() => setViewing(r)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{applicationDateLabel(r.performed_at)}</p>
                    <p className="font-medium">{r.procedure_name}</p>
                    {items.length > 0 && <p className="text-sm text-muted-foreground">{items.map((i) => `${i.region} · ${i.quantity ?? '?'} ${i.unit}`).join(' | ')}</p>}
                    <p className="text-xs text-muted-foreground">Profissional: {profName(r.professional_id)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 sm:flex-col sm:items-end">
                    <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    {r.amends_id && <span className="text-[11px] text-muted-foreground">Retificação</span>}
                    {r.based_on_id && <span className="text-[11px] text-muted-foreground">Baseada em anterior</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewing && (
        <ViewDialog record={viewing} clientName={clientName} profName={profName} receptionOnly={receptionOnly}
          canEdit={isAdmin || viewing.professional_id === myProfId}
          onClose={() => setViewing(null)} onEdit={() => startEdit(viewing)} onReference={() => startFromReference(viewing)} onAmend={() => amend(viewing)} />
      )}
      {editing && (
        <EditorSheet state={editing} setState={setEditing} clientId={clientId} templates={templates} professionals={professionals as any[]}
          isAdmin={isAdmin} onSaved={refresh} />
      )}
      {templatesOpen && <TemplatesDialog templates={templates} onClose={() => setTemplatesOpen(false)} />}
    </div>
  );
}

/* ---------------- Editor ---------------- */
interface EditorState {
  id?: string; updated_at?: string; appointment_id: string | null; professional_id: string | null; procedure_template_id: string | null; procedure_name: string;
  templateFields: TemplateField[]; templateVersion: number; performed_at: string; room: string; reason: string; follow_up_date: string;
  based_on_id: string | null; status: string; items: ApplicationItemDraft[]; values: Record<string, string>;
}
const newEditorState = (prof: string | null): EditorState => ({
  id: crypto.randomUUID(), appointment_id: null, professional_id: prof, procedure_template_id: null, procedure_name: '', templateFields: [], templateVersion: 1,
  performed_at: applicationLocalInput(new Date().toISOString()), room: '', reason: '', follow_up_date: '', based_on_id: null, status: 'draft',
  items: [emptyItem()], values: {},
});

function FieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const label = <Label className="text-xs">{field.label}{field.required && ' *'}</Label>;
  if (field.type === 'textarea') return <div className="space-y-1">{label}<Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
  if (field.type === 'select' || field.type === 'boolean') {
    const opts = field.type === 'boolean' ? ['Sim', 'Não'] : field.options ?? [];
    return <div className="space-y-1">{label}
      <Select value={value || undefined} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>;
  }
  return <div className="space-y-1">{label}<Input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function EditorSheet({ state, setState, clientId, templates, professionals, isAdmin, onSaved }: {
  state: EditorState; setState: (s: EditorState | null) => void; clientId: string; templates: Template[]; professionals: any[]; isAdmin: boolean; onSaved: () => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!editorEl) return;
    const viewport = window.visualViewport;
    const update = () => {
      const editor = editorEl;
      // visualViewport already excludes the keyboard; do not subtract kb-inset again.
      editor.style.setProperty('--application-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      editor.style.setProperty('--application-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [editorEl]);
  const { data: products = [] } = useQuery({
    queryKey: ['application_products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, brand, unit').eq('is_active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: appointments = [] } = useQuery({
    queryKey: ['application_appts', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id, start_time').eq('client_id', clientId).order('start_time', { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const appointmentId = state.appointment_id ?? '';
  const setAppointmentId = (id: string) => setState({ ...state, appointment_id: id });

  const set = (patch: Partial<EditorState>) => setState({ ...state, ...patch });
  const setItem = (idx: number, patch: Partial<ApplicationItemDraft>) => set({ items: state.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  const setVal = (id: string, v: string) => set({ values: { ...state.values, [id]: v } });

  const pickTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    set({ procedure_template_id: t.id, procedure_name: t.slug === 'personalizado' ? '' : t.name, templateFields: t.fields ?? [], templateVersion: t.version });
  };

  const save = async (finalize: boolean) => {
    if (saving) return;
    if (!isApplicationLocalDate(state.performed_at)) { toast.error('Informe uma data e hora válidas.'); return; }
    if (!state.procedure_name.trim()) { toast.error('Informe o procedimento.'); return; }
    const allFields = [...state.templateFields];
    if (finalize) {
      const missing = validateCompletion({ ...state, templateFields: allFields });
      if (missing.length) { toast.error(`Para finalizar, preencha: ${missing.join(', ')}.`); return; }
    }
    setSaving(true);
    try {
      const payload: any = {
        client_id: clientId, professional_id: state.professional_id, procedure_template_id: state.procedure_template_id,
        procedure_name: state.procedure_name.trim(),
        performed_at: state.performed_at, room: state.room || null, reason: state.reason || null,
        follow_up_date: state.follow_up_date || null, based_on_id: state.based_on_id, status: state.status === 'draft' ? 'in_progress' : state.status,
      };
      payload.appointment_id = appointmentId || null;
      const id = state.id;
      if (!id) throw new Error('Reabra a ficha para continuar.');
      const items = state.items.filter((i) => i.product_name_snapshot || i.region || i.quantity).map((i, idx) => ({
        position: idx, product_id: i.product_id, product_name_snapshot: i.product_name_snapshot,
        manufacturer_snapshot: i.manufacturer_snapshot || null, lot_number: i.lot_number || null, expiration_date: i.expiration_date || null,
        region: i.region, side: i.side || null, quantity: parseQuantity(i.quantity), unit: i.unit, technique: i.technique || null,
        dilution: i.dilution || null, instrument: i.instrument || null, notes: i.notes || null,
      }));
      const { data, error } = await db.rpc('save_application_record_atomic', {
        _id: id, _record: payload, _items: items, _values: state.values,
        _finalize: finalize, _expected_updated_at: state.updated_at ?? null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error('Não foi possível salvar a ficha.');
      toast.success(finalize ? 'Ficha finalizada.' : 'Ficha salva.');
      await onSaved();
      setState(null);
    } catch (e) {
      toast.error(e as any);
    } finally { setSaving(false); }
  };

  const cancelRecord = async () => {
    if (!state.id || !state.updated_at || !window.confirm('Cancelar esta ficha? Ela ficará registrada como cancelada.')) return;
    const { data } = await db.rpc('cancel_application_record', { _id: state.id });
    if (!data?.ok) { toast.error('Não foi possível cancelar a ficha.'); return; }
    toast.success('Ficha cancelada.'); await onSaved(); setState(null);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && setState(null)}>
      <SheetContent ref={setEditorEl} side="right" data-application-editor aria-describedby={undefined} className="application-editor w-full max-w-none sm:max-w-2xl [&_input]:min-w-0 [&_input]:max-w-full [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:min-w-0 [&_[role=combobox]]:text-base">
        <SheetHeader className="application-editor-header shrink-0 border-b text-left"><SheetTitle className="pr-8">{state.updated_at ? 'Editar ficha de aplicação' : 'Nova ficha de aplicação'}</SheetTitle></SheetHeader>
        <div data-application-fields className="application-editor-fields min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5">
          {state.based_on_id && <p className="rounded-md bg-muted p-2 text-xs">Baseada em ficha anterior. Confirme produto, lote, validade e quantidade.</p>}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Atendimento</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Data e hora *</Label><Input type="datetime-local" value={state.performed_at} onChange={(e) => set({ performed_at: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Profissional *</Label>
                <Select value={state.professional_id ?? undefined} onValueChange={(v) => set({ professional_id: v })} disabled={!isAdmin}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Modelo de ficha</Label>
                <Select value={state.procedure_template_id ?? undefined} onValueChange={pickTemplate}>
                  <SelectTrigger><SelectValue placeholder="Selecione o procedimento" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Procedimento realizado *</Label><Input value={state.procedure_name} onChange={(e) => set({ procedure_name: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Sala / unidade</Label><Input value={state.room} onChange={(e) => set({ room: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Agendamento vinculado</Label>
                <Select value={appointmentId || undefined} onValueChange={setAppointmentId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{appointments.map((a) => <SelectItem key={a.id} value={a.id}>{applicationDateLabel(a.start_time)}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Motivo do atendimento</Label><Input value={state.reason} onChange={(e) => set({ reason: e.target.value })} /></div>
          </section>

          <details className="rounded-md border p-3" open={!state.updated_at}>
            <summary className="cursor-pointer text-sm font-semibold">Avaliação antes do procedimento</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {BASE_FIELDS.map((f) => <FieldInput key={f.id} field={f} value={state.values[f.id] ?? ''} onChange={(v) => setVal(f.id, v)} />)}
            </div>
          </details>

          {state.templateFields.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Campos do procedimento</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {state.templateFields.map((f) => <FieldInput key={f.id} field={f} value={state.values[f.id] ?? ''} onChange={(v) => setVal(f.id, v)} />)}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Itens aplicados</h3>
              <Button size="sm" variant="outline" onClick={() => set({ items: [...state.items, emptyItem()] })}><Plus className="mr-1 h-4 w-4" />Item</Button>
            </div>
            {state.items.map((it, idx) => (
              <Card key={idx} className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  {state.items.length > 1 && <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => set({ items: state.items.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Produto do cadastro</Label>
                    <Select value={it.product_id ?? undefined} onValueChange={(v) => {
                      const p: any = products.find((x: any) => x.id === v);
                      setItem(idx, { product_id: v, product_name_snapshot: p?.name ?? '', manufacturer_snapshot: p?.brand ?? '', unit: p?.unit && UNIT_OPTIONS.includes(p.unit) ? p.unit : it.unit });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione ou digite abaixo" /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}{p.brand ? ` — ${p.brand}` : ''}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="space-y-1"><Label className="text-xs">Nome do produto *</Label><Input value={it.product_name_snapshot} onChange={(e) => setItem(idx, { product_name_snapshot: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Fabricante</Label><Input value={it.manufacturer_snapshot} onChange={(e) => setItem(idx, { manufacturer_snapshot: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Lote</Label><Input value={it.lot_number} onChange={(e) => setItem(idx, { lot_number: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Validade</Label><Input type="date" value={it.expiration_date} onChange={(e) => setItem(idx, { expiration_date: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Região *</Label><Input value={it.region} onChange={(e) => setItem(idx, { region: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Lado</Label>
                    <Select value={it.side || undefined} onValueChange={(v) => setItem(idx, { side: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{SIDE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-xs">Quantidade *</Label><Input type="number" inputMode="decimal" min="0" step="0.01" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Unidade *</Label>
                    <Select value={it.unit} onValueChange={(v) => setItem(idx, { unit: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-xs">Técnica</Label><Input value={it.technique} onChange={(e) => setItem(idx, { technique: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Diluição</Label><Input value={it.dilution} onChange={(e) => setItem(idx, { dilution: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Instrumento</Label><Input value={it.instrument} onChange={(e) => setItem(idx, { instrument: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Observações</Label><Textarea rows={2} value={it.notes} onChange={(e) => setItem(idx, { notes: e.target.value })} /></div>
                </div>
              </Card>
            ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Orientações e retorno</h3>
            {GUIDANCE_FIELDS.map((f) => <FieldInput key={f.id} field={f} value={state.values[f.id] ?? ''} onChange={(v) => setVal(f.id, v)} />)}
            <div className="space-y-1 sm:max-w-xs"><Label className="text-xs">Data sugerida de retorno</Label><Input type="date" value={state.follow_up_date} onChange={(e) => set({ follow_up_date: e.target.value })} /></div>
          </section>

        </div>
          <div data-application-actions className="application-editor-actions flex shrink-0 flex-col-reverse gap-2 border-t bg-background sm:flex-row sm:justify-end">
            {state.updated_at && <Button variant="ghost" onClick={cancelRecord} disabled={saving}>Cancelar ficha</Button>}
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>Salvar rascunho</Button>
            <Button onClick={() => save(true)} disabled={saving}>Finalizar ficha</Button>
          </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Visualização ---------------- */
function ViewDialog({ record: r, clientName, profName, receptionOnly, canEdit, onClose, onEdit, onReference, onAmend }: {
  record: RecordRow; clientName: string; profName: (id: string | null) => string; receptionOnly: boolean; canEdit: boolean;
  onClose: () => void; onEdit: () => void; onReference: () => void; onAmend: () => void;
}) {
  const vals = Object.fromEntries((r.application_field_values ?? []).map((v) => [v.field_id, v.value]));
  const fields = [...BASE_FIELDS, ...(r.template_snapshot?.fields ?? []), ...GUIDANCE_FIELDS].filter((f) => vals[f.id]);
  const locked = ['completed', 'cancelled', 'amended'].includes(r.status);
  const items = (r.application_items ?? []).sort((a, b) => a.position - b.position);

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
    w.document.write(`<html><head><title>Ficha de aplicação</title><style>body{font-family:system-ui,sans-serif;padding:24px;font-size:13px}h1{font-size:18px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}table{border-collapse:collapse;width:100%;margin:8px 0}</style></head><body>
      <h1>FICHA DE APLICAÇÃO</h1>
      <p><b>Cliente:</b> ${esc(clientName)}<br><b>Data:</b> ${applicationDateLabel(r.performed_at)}<br><b>Profissional:</b> ${esc(profName(r.professional_id))}<br><b>Procedimento:</b> ${esc(r.procedure_name)}<br><b>Status:</b> ${STATUS_LABEL[r.status]}</p>
      ${fields.map((f) => `<p><b>${esc(f.label)}:</b> ${esc(vals[f.id])}</p>`).join('')}
      <table><tr><th>Produto</th><th>Fabricante</th><th>Lote</th><th>Validade</th><th>Região</th><th>Lado</th><th>Qtd.</th><th>Técnica</th></tr>
      ${items.map((i) => `<tr><td>${esc(i.product_name_snapshot)}</td><td>${esc(i.manufacturer_snapshot)}</td><td>${esc(i.lot_number)}</td><td>${i.expiration_date ? format(new Date(i.expiration_date + 'T12:00:00'), 'MM/yyyy') : ''}</td><td>${esc(i.region)}</td><td>${esc(i.side)}</td><td>${esc(i.quantity)} ${esc(i.unit)}</td><td>${esc(i.technique)}</td></tr>`).join('')}</table>
      ${r.follow_up_date ? `<p><b>Retorno sugerido:</b> ${format(new Date(r.follow_up_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>` : ''}
      <br><br><p>_______________________________<br>Assinatura do profissional</p><p>_______________________________<br>Assinatura do cliente</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{r.procedure_name} {locked && <Lock className="h-4 w-4 text-muted-foreground" />}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>{applicationDateLabel(r.performed_at)}</span><span>{profName(r.professional_id)}</span>
            <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status]}</Badge>
          </div>
          {r.amendment_reason && <p className="rounded-md bg-muted p-2 text-xs">Retificação — motivo: {r.amendment_reason}</p>}
          {receptionOnly ? <p className="text-xs text-muted-foreground">Os dados técnicos são visíveis apenas para profissionais e administradores.</p> : (
            <>
              {fields.map((f) => <div key={f.id}><p className="text-xs text-muted-foreground">{f.label}</p><p className="whitespace-pre-wrap">{vals[f.id]}</p></div>)}
              {items.map((i, idx) => (
                <Card key={i.id} className="p-3">
                  <p className="text-xs font-medium text-muted-foreground">Item {idx + 1}</p>
                  <p className="font-medium">{i.product_name_snapshot}{i.manufacturer_snapshot ? ` — ${i.manufacturer_snapshot}` : ''}</p>
                  <p>{i.region}{i.side ? ` · ${i.side}` : ''} · {i.quantity} {i.unit}</p>
                  <p className="text-xs text-muted-foreground">{[i.lot_number && `Lote ${i.lot_number}`, i.expiration_date && `Validade ${format(new Date(i.expiration_date + 'T12:00:00'), 'MM/yyyy')}`, i.technique, i.dilution && `Diluição ${i.dilution}`].filter(Boolean).join(' · ')}</p>
                  {i.notes && <p className="mt-1 text-xs">{i.notes}</p>}
                </Card>
              ))}
              {r.follow_up_date && <p>Retorno sugerido: {format(new Date(r.follow_up_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>}
            </>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!receptionOnly && <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>}
          {!receptionOnly && <Button variant="outline" onClick={onReference}><Copy className="mr-1 h-4 w-4" />Usar como referência</Button>}
          {canEdit && r.status === 'completed' && <Button variant="outline" onClick={onAmend}>Retificar</Button>}
          {canEdit && !locked && <Button onClick={onEdit}>Continuar preenchimento</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Modelos (admin) ---------------- */
function TemplatesDialog({ templates, onClose }: { templates: Template[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<{ id?: string; name: string; fields: TemplateField[] } | null>(null);
  const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const save = async () => {
    if (!edit?.name.trim()) return;
    const ids = edit.fields.map((f) => f.id);
    if (edit.fields.some((f) => !f.label.trim())) { toast.error('Todo campo precisa de um nome.'); return; }
    if (new Set(ids).size !== ids.length) { toast.error('Há campos com o mesmo identificador.'); return; }
    const { data: owner } = await supabase.rpc('current_account_owner_id' as any);
    const row = { name: edit.name.trim(), slug: slugify(edit.name), fields: edit.fields };
    const { error } = edit.id
      ? await db.from('procedure_templates').update(row).eq('id', edit.id)
      : await db.from('procedure_templates').insert({ ...row, account_owner_id: owner });
    if (error) { toast.error(error); return; }
    toast.success('Modelo salvo.');
    qc.invalidateQueries({ queryKey: ['procedure_templates'] });
    setEdit(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Modelos de ficha por procedimento</DialogTitle></DialogHeader>
        {!edit ? (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{t.name} <span className="text-xs text-muted-foreground">({t.fields?.length ?? 0} campos{t.account_owner_id ? '' : ' · padrão'})</span></span>
                <Button size="sm" variant="ghost" onClick={() => setEdit(t.account_owner_id ? { id: t.id, name: t.name, fields: t.fields ?? [] } : { name: `${t.name} (clínica)`, fields: t.fields ?? [] })}>
                  {t.account_owner_id ? 'Editar' : 'Duplicar'}
                </Button>
              </div>
            ))}
            <Button className="w-full" variant="outline" onClick={() => setEdit({ name: '', fields: [] })}><Plus className="mr-1 h-4 w-4" />Novo modelo</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Nome do procedimento</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            {edit.fields.map((f, idx) => (
              <Card key={idx} className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
                <Input placeholder="Nome do campo" value={f.label} onChange={(e) => {
                  const fields = [...edit.fields];
                  // identificador fixo: definido na criação, nunca muda depois
                  fields[idx] = { ...f, label: e.target.value, id: f.id || '' };
                  setEdit({ ...edit, fields });
                }} onBlur={() => {
                  if (f.id || !f.label.trim()) return;
                  const fields = [...edit.fields]; let id = slugify(f.label); let n = 2;
                  while (fields.some((x, i) => i !== idx && x.id === id)) id = `${slugify(f.label)}_${n++}`;
                  fields[idx] = { ...f, id }; setEdit({ ...edit, fields });
                }} />
                <Select value={f.type} onValueChange={(v) => { const fields = [...edit.fields]; fields[idx] = { ...f, type: v as any }; setEdit({ ...edit, fields }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[['text', 'Texto'], ['textarea', 'Texto longo'], ['number', 'Número'], ['select', 'Lista de opções'], ['boolean', 'Sim/Não'], ['date', 'Data']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {f.type === 'select' && <Input className="sm:col-span-2" placeholder="Opções separadas por vírgula" value={(f.options ?? []).join(', ')}
                  onChange={(e) => { const fields = [...edit.fields]; fields[idx] = { ...f, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }; setEdit({ ...edit, fields }); }} />}
                <div className="flex items-center justify-between sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.required} onChange={(e) => { const fields = [...edit.fields]; fields[idx] = { ...f, required: e.target.checked }; setEdit({ ...edit, fields }); }} />Obrigatório</label>
                  <Button size="icon" variant="ghost" aria-label="Remover campo" onClick={() => setEdit({ ...edit, fields: edit.fields.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" size="sm" onClick={() => setEdit({ ...edit, fields: [...edit.fields, { id: '', label: '', type: 'text' }] })}><Plus className="mr-1 h-4 w-4" />Campo</Button>
            <DialogFooter><Button variant="ghost" onClick={() => setEdit(null)}>Voltar</Button><Button onClick={save}>Salvar modelo</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
