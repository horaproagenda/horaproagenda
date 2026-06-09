import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Building2, User, Receipt, Calendar, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAddressByCep, formatCep } from '@/lib/viacep';
import type { BoletoPackageReleaseRule } from '@/lib/boletoInstallmentSync';


async function lookupCep(cep: string, apply: (data: { street?: string; neighborhood?: string; city?: string; state?: string }) => void) {
  const data = await fetchAddressByCep(cep);
  if (!data) return;
  apply({
    street: data.logradouro,
    neighborhood: data.bairro,
    city: data.localidade,
    state: data.uf,
  });
  toast.success('Endereço preenchido pelo CEP');
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Beneficiary {
  name: string; cnpj: string; address: string; cep: string; city: string; state: string;
  professional_id?: string;
}

interface Payer {
  client_id: string;
  name: string; document: string; company_name?: string;
  cep: string; street: string; number: string; complement: string;
  neighborhood: string; city: string; state: string;
}

const today = () => new Date().toISOString().split('T')[0];

export function CreateBoletoParceladoDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { clients } = useClients();
  const { activeServices } = useServices();
  const { templates: packageTemplates } = usePackageTemplates();
  const { activePaymentMethods } = usePaymentMethods();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('beneficiario');
  const [submitting, setSubmitting] = useState(false);

  // Deduplicate by name to avoid duplicates in the select
  const serviceOptions = useMemo(() => {
    const seen = new Map<string, any>();
    for (const s of activeServices) {
      const key = `${(s.name || '').trim().toLowerCase()}|${s.price}`;
      if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [activeServices]);

  const packageOptions = useMemo(() => {
    const seen = new Map<string, any>();
    for (const p of packageTemplates) {
      const key = `${(p.name || '').trim().toLowerCase()}|${p.price}`;
      if (!seen.has(key)) seen.set(key, p);
    }
    return Array.from(seen.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [packageTemplates]);


  // Beneficiary (auto-fill from logged professional)
  const [beneficiary, setBeneficiary] = useState<Beneficiary>({
    name: '', cnpj: '', address: '', cep: '', city: '', state: '',
  });

  // Payer
  const [payer, setPayer] = useState<Payer>({
    client_id: '', name: '', document: '', company_name: '',
    cep: '', street: '', number: '', complement: '',
    neighborhood: '', city: '', state: '',
  });
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  // Sale info
  const [itemType, setItemType] = useState<'service' | 'package' | 'custom'>('service');
  const [itemId, setItemId] = useState<string>('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(2);
  // For services: how many applications the client is buying + discount on the total
  const [applicationsCount, setApplicationsCount] = useState<number>(1);
  const [applicationsDiscount, setApplicationsDiscount] = useState<number>(0);
  // For packages: discount applied to package total (subtracted from total to parcel)
  const [packageDiscount, setPackageDiscount] = useState<number>(0);
  const [firstDueDate, setFirstDueDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [packageReleaseRule, setPackageReleaseRule] = useState<BoletoPackageReleaseRule>('boleto_first_paid');

  // Fees
  const [interestPctDay, setInterestPctDay] = useState<number>(0.033);
  const [finePct, setFinePct] = useState<number>(2);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountUntilDays, setDiscountUntilDays] = useState<number>(0);
  const [notes, setNotes] = useState('');
  // Map parcel number -> paid_date string (for retroactive parcels)
  const [retroPaidDates, setRetroPaidDates] = useState<Record<number, string>>({});

  const boletoPaymentMethod = useMemo(
    () => activePaymentMethods.find(pm =>
      pm.name.toLowerCase().includes('boleto')
    ),
    [activePaymentMethods]
  );

  // Pre-fill beneficiary from logged professional (or first active)
  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      let { data: prof } = await supabase
        .from('professionals')
        .select('id, name, company_name, cnpj, beneficiary_address, beneficiary_cep, beneficiary_city, beneficiary_state, cpf')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!prof) {
        const { data: any1 } = await supabase
          .from('professionals')
          .select('id, name, company_name, cnpj, beneficiary_address, beneficiary_cep, beneficiary_city, beneficiary_state, cpf')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        prof = any1;
      }

      if (prof) {
        setBeneficiary({
          professional_id: prof.id,
          name: prof.company_name || prof.name || '',
          cnpj: prof.cnpj || prof.cpf || '',
          address: prof.beneficiary_address || '',
          cep: prof.beneficiary_cep || '',
          city: prof.beneficiary_city || '',
          state: prof.beneficiary_state || '',
        });
      }
    })();
  }, [open, user?.id]);

  // When client is picked, pre-fill payer fields
  const handlePickClient = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    setPayer({
      client_id: c.id,
      name: c.name || '',
      document: (c as any).cpf || (c as any).cnpj || '',
      company_name: (c as any).company_name || '',
      cep: (c as any).cep || '',
      street: (c as any).address_street || '',
      number: (c as any).address_number || '',
      complement: (c as any).address_complement || '',
      neighborhood: (c as any).address_neighborhood || '',
      city: (c as any).address_city || '',
      state: (c as any).address_state || '',
    });
    setClientPickerOpen(false);
  };

  // Auto-fill when service/package picked. For services and packages, total = unitPrice * qty - discount.
  useEffect(() => {
    if (itemType === 'service' && itemId) {
      const s = serviceOptions.find(x => x.id === itemId);
      if (s) {
        const unit = Number(s.price) || 0;
        const qty = Math.max(1, applicationsCount || 1);
        const disc = Math.max(0, applicationsDiscount || 0);
        const total = Math.max(0, unit * qty - disc);
        setServiceDescription(qty > 1 ? `${qty}x ${s.name}` : s.name);
        setTotalAmount(Number(total.toFixed(2)));
      }
    } else if (itemType === 'package' && itemId) {
      const p = packageOptions.find(x => x.id === itemId);
      if (p) {
        setServiceDescription(p.name);
        const base = Number(p.price) || 0;
        const disc = Math.max(0, packageDiscount || 0);
        setTotalAmount(Number(Math.max(0, base - disc).toFixed(2)));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, itemType, applicationsCount, applicationsDiscount, packageDiscount]);

  const installmentValue = useMemo(() => {
    if (!totalAmount || !installments) return 0;
    return Math.round((totalAmount / installments) * 100) / 100;
  }, [totalAmount, installments]);

  const previewInstallments = useMemo(() => {
    if (!totalAmount || !installments || !firstDueDate) return [];
    const base = Math.round((totalAmount / installments) * 100) / 100;
    const remainder = Math.round((totalAmount - base * installments) * 100) / 100;
    return Array.from({ length: installments }, (_, i) => {
      const d = new Date(firstDueDate + 'T12:00:00');
      d.setDate(d.getDate() + i * intervalDays);
      return {
        n: i + 1,
        amount: i === 0 ? base + remainder : base,
        dueDate: d.toISOString().split('T')[0],
      };
    });
  }, [totalAmount, installments, firstDueDate, intervalDays]);

  const canSubmit = !!beneficiary.name && !!payer.client_id && !!payer.name &&
    totalAmount > 0 && installments >= 1 && !!firstDueDate && !!serviceDescription &&
    !!boletoPaymentMethod;

  const handleSubmit = async () => {
    if (!canSubmit || !boletoPaymentMethod) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    setSubmitting(true);
    try {
      // 1) Persist client address updates if missing
      if (payer.client_id) {
        await supabase.from('clients').update({
          cep: payer.cep || null,
          address_street: payer.street || null,
          address_number: payer.number || null,
          address_complement: payer.complement || null,
          address_neighborhood: payer.neighborhood || null,
          address_city: payer.city || null,
          address_state: payer.state || null,
          cnpj: payer.document && payer.document.replace(/\D/g, '').length === 14 ? payer.document : undefined,
          company_name: payer.company_name || undefined,
        }).eq('id', payer.client_id);
      }

      // 2) Create single_sale
      // Compute original (gross) and discount based on item type.
      let originalGross = totalAmount;
      let discountTotal = 0;
      if (itemType === 'service' && itemId) {
        const s = serviceOptions.find(x => x.id === itemId);
        const unit = Number(s?.price || 0);
        const qty = Math.max(1, applicationsCount || 1);
        originalGross = Number((unit * qty).toFixed(2));
        discountTotal = Math.max(0, applicationsDiscount || 0);
      } else if (itemType === 'package' && itemId) {
        const p = packageOptions.find(x => x.id === itemId);
        originalGross = Number(p?.price || totalAmount);
        discountTotal = Math.max(0, packageDiscount || 0);
      }

      const saleInsert: any = {
        client_id: payer.client_id,
        description: serviceDescription,
        original_amount: originalGross,
        discount_amount: discountTotal,
        final_amount: totalAmount,
        payment_method_id: boletoPaymentMethod.id,
        sale_date: today(),
        item_type: itemType === 'package' ? 'package' : 'service',
        installments: installments,
        notes: notes || null,
        created_by: user?.id || null,
      };
      if (itemType === 'service' && itemId) saleInsert.service_id = itemId;
      // IMPORTANT: do NOT set package_id to the template id — single_sales.package_id
      // references service_packages (per-client purchases), not package_templates.
      // For packages we create the service_packages clone after, then patch the sale.

      const { data: sale, error: saleErr } = await supabase
        .from('single_sales')
        .insert(saleInsert)
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 3) Create installments with all metadata. Retroactive installments (due date already
      // in the past) can be marked as paid up-front with the provided paid_date so the
      // historical baixa is registered correctly.
      const payerSnapshot = { ...payer };
      const beneficiarySnapshot = { ...beneficiary };
      const todayStr = today();

      const records = previewInstallments.map(p => {
        const discountUntil = discountUntilDays > 0
          ? (() => {
              const dd = new Date(p.dueDate + 'T12:00:00');
              dd.setDate(dd.getDate() - discountUntilDays);
              return dd.toISOString().split('T')[0];
            })()
          : null;
        const isRetro = p.dueDate < todayStr;
        const retroPaidDate = retroPaidDates[p.n];
        const markPaid = isRetro && retroPaidDate;
        return {
          sale_id: sale.id,
          installment_number: p.n,
          total_installments: installments,
          amount: p.amount,
          due_date: p.dueDate,
          status: markPaid ? 'paid' : 'pending',
          paid_date: markPaid ? retroPaidDate : null,
          interest_percent_per_day: interestPctDay,
          fine_percent: finePct,
          discount_amount: discountAmount,
          discount_until_date: discountUntil,
          service_description: serviceDescription,
          payer_snapshot: payerSnapshot,
          beneficiary_snapshot: beneficiarySnapshot,
          notes: notes || null,
          created_by: user?.id || null,
        };
      });

      const { error: instErr } = await supabase
        .from('boleto_installments')
        .insert(records);
      if (instErr) throw instErr;


      // 4) Provision inventory. Packages bought by boleto are created inactive and
      // become bookable only when the configured payment rule is met.
      if (itemType === 'service' && itemId) {
        const qty = Math.max(1, applicationsCount || 1);
        const perAppPaid = Number((totalAmount / qty).toFixed(2));
        const rows = Array.from({ length: qty }, (_, i) => ({
          client_id: payer.client_id,
          service_id: itemId,
          sale_id: sale.id,
          amount_paid: perAppPaid,
          status: 'available',
          notes: qty > 1
            ? `Aplicação ${i + 1}/${qty} — Disponibilizado via Boleto Parcelado`
            : 'Disponibilizado via Boleto Parcelado',
          created_by: user?.id || null,
        }));
        await supabase.from('client_services').insert(rows);
      } else if (itemType === 'package' && itemId) {
        // Clone from package_templates (the only valid source — service_packages are
        // per-client purchase records and would create duplicates in the picker).
        const template = packageOptions.find(t => t.id === itemId);

        if (template) {
          const { data: clientPackage, error: pkgError } = await supabase
            .from('service_packages')
            .insert({
              name: template.name,
              description: template.description,
              client_id: payer.client_id,
              template_id: template.id,
              total_sessions: template.total_sessions,
              duration: template.duration || 60,
              interval_days: template.interval_days || 7,
              total_price: totalAmount,
              package_type: template.package_type || 'standard',
              service_id: template.service_id || null,
              professional_id: template.professional_id,
              room_id: template.room_id,
              equipment: template.equipment || [],
              payment_methods: boletoPaymentMethod.id ? [boletoPaymentMethod.id] : [],
              payment_type: packageReleaseRule,
              sessions_scheduled: 0,
              is_active: false,
              category: template.category || 'Pago via Boleto Parcelado',
            })
            .select()
            .single();

          if (!pkgError && clientPackage) {
            const templateSteps = template.package_type === 'sequential' && template.steps?.length
              ? template.steps
              : Array.from({ length: template.total_sessions }, (_, i) => ({
                  service_id: template.service_id || null,
                  interval_after_days: template.interval_days || 7,
                  sequence_order: i + 1,
                }));

            const sessions = templateSteps.map((step: any, i: number) => ({
              package_id: clientPackage.id,
              service_id: step.service_id || template.service_id || null,
              session_number: i + 1,
              original_session_number: i + 1,
              sequence_order: step.sequence_order || i + 1,
              interval_after_days:
                i === templateSteps.length - 1 ? 0 : step.interval_after_days || template.interval_days || 7,
              status: 'pending',
              notes: 'Disponibilizado via Boleto Parcelado',
            }));

            await supabase.from('package_appointments').insert(sessions);

            // Update sale to point to the client-specific package
            await supabase.from('single_sales').update({ package_id: clientPackage.id }).eq('id', sale.id);
          }
        }
      }


      toast.success(`Boleto parcelado em ${installments}x criado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['boleto_installments_all'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-packages'] });
      onOpenChange(false);

      // reset
      setTab('beneficiario');
      setItemId(''); setServiceDescription(''); setTotalAmount(0);
      setInstallments(2); setNotes(''); setPackageReleaseRule('boleto_first_paid');
      setApplicationsCount(1); setApplicationsDiscount(0); setPackageDiscount(0);
      setRetroPaidDates({});
      setPayer({ client_id: '', name: '', document: '', company_name: '',
        cep: '', street: '', number: '', complement: '',
        neighborhood: '', city: '', state: '' });

    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao criar boleto: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Criar Boleto Parcelado
          </DialogTitle>
          <DialogDescription>
            Gere um boleto parcelado vinculado a uma venda de serviço ou pacote.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto px-6 py-3 scrollbar-visible" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="flex w-full h-auto p-1 gap-1 bg-muted/50">
              <TabsTrigger
                value="beneficiario"
                className="flex-1 gap-1 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=inactive]:text-blue-700 dark:data-[state=inactive]:text-blue-300"
              >
                <Building2 className="h-3.5 w-3.5" />Beneficiário
              </TabsTrigger>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <TabsTrigger
                value="pagador"
                className="flex-1 gap-1 data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=inactive]:text-purple-700 dark:data-[state=inactive]:text-purple-300"
              >
                <User className="h-3.5 w-3.5" />Pagador
              </TabsTrigger>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <TabsTrigger
                value="financeiro"
                className="flex-1 gap-1 data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=inactive]:text-emerald-700 dark:data-[state=inactive]:text-emerald-300"
              >
                <Receipt className="h-3.5 w-3.5" />Financeiro
              </TabsTrigger>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <TabsTrigger
                value="parcelas"
                className="flex-1 gap-1 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=inactive]:text-orange-700 dark:data-[state=inactive]:text-orange-300"
              >
                <Calendar className="h-3.5 w-3.5" />Parcelas
              </TabsTrigger>
            </TabsList>


            {/* BENEFICIÁRIO */}
            <TabsContent value="beneficiario" className="space-y-3 pt-3">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Dados pré-preenchidos do profissional logado. Edite em <strong>Cadastros → Profissionais</strong> para reutilizar nos próximos boletos.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome / Razão Social *</Label>
                  <Input value={beneficiary.name} onChange={e => setBeneficiary({ ...beneficiary, name: e.target.value })} />
                </div>
                <div>
                  <Label>CNPJ / CPF</Label>
                  <Input value={beneficiary.cnpj} onChange={e => setBeneficiary({ ...beneficiary, cnpj: e.target.value })} />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={beneficiary.cep}
                    placeholder="00000-000"
                    maxLength={9}
                    onChange={e => setBeneficiary({ ...beneficiary, cep: formatCep(e.target.value) })}
                    onBlur={e => lookupCep(e.target.value, ({ street, neighborhood, city, state }) => {
                      setBeneficiary(prev => ({
                        ...prev,
                        address: [street, neighborhood].filter(Boolean).join(', ') || prev.address,
                        city: city || prev.city,
                        state: state || prev.state,
                      }));
                    })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Endereço completo</Label>
                  <Input value={beneficiary.address} onChange={e => setBeneficiary({ ...beneficiary, address: e.target.value })} placeholder="Rua, número, bairro" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={beneficiary.city} onChange={e => setBeneficiary({ ...beneficiary, city: e.target.value })} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={beneficiary.state} maxLength={2} onChange={e => setBeneficiary({ ...beneficiary, state: e.target.value.toUpperCase() })} />
                </div>
              </div>
            </TabsContent>

            {/* PAGADOR */}
            <TabsContent value="pagador" className="space-y-3 pt-3">
              <div>
                <Label>Cliente *</Label>
                <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {payer.name || 'Selecione o cliente...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[60] bg-popover">
                    <Command>
                      <CommandInput placeholder="Buscar cliente..." />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {clients.filter(c => c.is_active !== false).map(c => (
                            <CommandItem key={c.id} value={c.name} onSelect={() => handlePickClient(c.id)}>
                              <Check className={cn('mr-2 h-4 w-4', payer.client_id === c.id ? 'opacity-100' : 'opacity-0')} />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome / Razão Social *</Label>
                  <Input value={payer.name} onChange={e => setPayer({ ...payer, name: e.target.value })} />
                </div>
                <div>
                  <Label>CPF / CNPJ</Label>
                  <Input value={payer.document} onChange={e => setPayer({ ...payer, document: e.target.value })} />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={payer.cep}
                    placeholder="00000-000"
                    maxLength={9}
                    onChange={e => setPayer({ ...payer, cep: formatCep(e.target.value) })}
                    onBlur={e => lookupCep(e.target.value, ({ street, neighborhood, city, state }) => {
                      setPayer(prev => ({
                        ...prev,
                        street: street || prev.street,
                        neighborhood: neighborhood || prev.neighborhood,
                        city: city || prev.city,
                        state: state || prev.state,
                      }));
                    })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Rua / Logradouro</Label>
                  <Input value={payer.street} onChange={e => setPayer({ ...payer, street: e.target.value })} />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={payer.number} onChange={e => setPayer({ ...payer, number: e.target.value })} />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input value={payer.complement} onChange={e => setPayer({ ...payer, complement: e.target.value })} />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={payer.neighborhood} onChange={e => setPayer({ ...payer, neighborhood: e.target.value })} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={payer.city} onChange={e => setPayer({ ...payer, city: e.target.value })} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={payer.state} maxLength={2} onChange={e => setPayer({ ...payer, state: e.target.value.toUpperCase() })} />
                </div>
              </div>
            </TabsContent>

            {/* FINANCEIRO */}
            <TabsContent value="financeiro" className="space-y-3 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Tipo *</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={itemType}
                    onChange={e => { setItemType(e.target.value as any); setItemId(''); setTotalAmount(0); setApplicationsCount(1); setApplicationsDiscount(0); setPackageDiscount(0); }}>
                    <option value="service">Serviço</option>
                    <option value="package">Pacote</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                {itemType !== 'custom' && (
                  <div className="col-span-2">
                    <Label>{itemType === 'service' ? 'Serviço' : 'Pacote'} *</Label>
                    <ItemPicker
                      items={itemType === 'service' ? serviceOptions : packageOptions}
                      value={itemId}
                      onChange={setItemId}
                      placeholder={itemType === 'service' ? 'Buscar serviço...' : 'Buscar pacote...'}
                      kind={itemType}
                    />
                  </div>
                )}

              </div>

              {itemType === 'service' && itemId && (() => {
                const s = serviceOptions.find(x => x.id === itemId);
                const unit = Number(s?.price || 0);
                const subtotal = unit * Math.max(1, applicationsCount || 1);
                return (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Quantas aplicações deste serviço o cliente está comprando? O valor total será recalculado automaticamente.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Qtd. aplicações *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={applicationsCount}
                          onChange={e => setApplicationsCount(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </div>
                      <div>
                        <Label>Valor unitário</Label>
                        <Input value={`R$ ${unit.toFixed(2)}`} disabled />
                      </div>
                      <div>
                        <Label>Subtotal</Label>
                        <Input value={`R$ ${subtotal.toFixed(2)}`} disabled />
                      </div>
                      <div>
                        <Label>Desconto total (R$)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={applicationsDiscount}
                          onChange={e => setApplicationsDiscount(Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Total a parcelar</Label>
                        <Input
                          value={`R$ ${Math.max(0, subtotal - (applicationsDiscount || 0)).toFixed(2)}`}
                          disabled
                          className="font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <Label>Descrição do serviço/pacote *</Label>
                <Input value={serviceDescription} onChange={e => setServiceDescription(e.target.value)}
                  placeholder="Ex.: Pacote de 10 sessões — Drenagem Linfática" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor total *</Label>
                  <Input type="number" step="0.01" value={totalAmount}
                    onChange={e => setTotalAmount(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Nº parcelas *</Label>
                  <Input type="number" min={1} max={36} value={installments}
                    onChange={e => setInstallments(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Valor por parcela</Label>
                  <Input value={`R$ ${installmentValue.toFixed(2)}`} disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vencimento da 1ª *</Label>
                  <Input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
                </div>
                <div>
                  <Label>Intervalo entre parcelas (dias)</Label>
                  <Input type="number" min={1} value={intervalDays}
                    onChange={e => setIntervalDays(Number(e.target.value))} />
                </div>
              </div>

              {itemType === 'package' && itemId && (() => {
                const p = packageOptions.find(x => x.id === itemId);
                const base = Number(p?.price || 0);
                const finalVal = Math.max(0, base - (packageDiscount || 0));
                return (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Desconto aplicado ao valor total do pacote. O valor a parcelar será recalculado automaticamente.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Valor do pacote</Label>
                        <Input value={`R$ ${base.toFixed(2)}`} disabled />
                      </div>
                      <div>
                        <Label>Desconto (R$)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={packageDiscount}
                          onChange={e => setPackageDiscount(Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                      <div>
                        <Label>Total a parcelar</Label>
                        <Input value={`R$ ${finalVal.toFixed(2)}`} disabled className="font-semibold" />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {itemType === 'package' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <Label>Disponibilizar pacote para agendamento</Label>
                  <RadioGroup
                    value={packageReleaseRule}
                    onValueChange={(value) => setPackageReleaseRule(value as BoletoPackageReleaseRule)}
                    className="grid gap-2"
                  >
                    <label className="flex items-start gap-2 rounded-md border bg-background p-2 cursor-pointer">
                      <RadioGroupItem value="boleto_first_paid" className="mt-0.5" />
                      <span className="text-xs leading-relaxed">
                        Após confirmar a primeira parcela
                        <span className="block text-muted-foreground">O pacote fica bloqueado até a primeira baixa do boleto.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded-md border bg-background p-2 cursor-pointer">
                      <RadioGroupItem value="boleto_all_paid" className="mt-0.5" />
                      <span className="text-xs leading-relaxed">
                        Somente quando todas as parcelas forem pagas
                        <span className="block text-muted-foreground">O pacote só aparece para agendamento após quitação total.</span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>
              )}

              <Separator />
              <p className="text-sm font-medium">Encargos & Descontos</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Juros ao dia (%)</Label>
                  <Input type="number" step="0.001" value={interestPctDay}
                    onChange={e => setInterestPctDay(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Multa por atraso (%)</Label>
                  <Input type="number" step="0.01" value={finePct}
                    onChange={e => setFinePct(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Desconto antecipado (R$)</Label>
                  <Input type="number" step="0.01" value={discountAmount}
                    onChange={e => setDiscountAmount(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Desconto válido até (dias antes)</Label>
                  <Input type="number" min={0} value={discountUntilDays}
                    onChange={e => setDiscountUntilDays(Number(e.target.value))} />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </TabsContent>

            {/* PARCELAS PREVIEW */}
            <TabsContent value="parcelas" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Pré-visualização das parcelas que serão geradas. Parcelas com vencimento <strong>anterior à data de hoje</strong> podem ser marcadas como pagas informando a data correta da baixa.
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Cota</th>
                      <th className="text-left p-2">Vencimento</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-left p-2">Data de pagamento (retroativo)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewInstallments.map(p => {
                      const isRetro = p.dueDate < today();
                      return (
                        <tr key={p.n} className="border-t">
                          <td className="p-2"><Badge variant="outline">{String(p.n).padStart(2, '0')}/{String(installments).padStart(2, '0')}</Badge></td>
                          <td className="p-2">
                            {new Date(p.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {isRetro && <Badge variant="outline" className="ml-2 text-[10px] text-orange-600 border-orange-300">Retroativo</Badge>}
                          </td>
                          <td className="p-2 text-right">R$ {p.amount.toFixed(2)}</td>
                          <td className="p-2">
                            {isRetro ? (
                              <Input
                                type="date"
                                className="h-8 text-xs w-40"
                                max={today()}
                                value={retroPaidDates[p.n] || ''}
                                onChange={e => setRetroPaidDates(prev => ({ ...prev, [p.n]: e.target.value }))}
                                placeholder="Selecione a data da baixa"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {finePct}% multa · {interestPctDay}%/dia
                                {discountAmount > 0 && ` · -R$${discountAmount.toFixed(2)} até ${discountUntilDays}d antes`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {previewInstallments.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Preencha os dados financeiros para visualizar.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {previewInstallments.some(p => p.dueDate < today()) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Informe a <strong>data real da baixa</strong> para cada parcela retroativa. Se nenhuma data for informada, a parcela será criada como <strong>pendente</strong>.
                  </AlertDescription>
                </Alert>
              )}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Cada parcela aparecerá em <strong>Lembretes a Receber</strong> próximo ao vencimento e poderá ser baixada manualmente em <strong>Financeiro → Boleto</strong>.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t px-6 py-3 flex flex-row justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <div className="flex gap-2">
            {tab !== 'beneficiario' && (
              <Button
                variant="outline"
                onClick={() => {
                  const order = ['beneficiario', 'pagador', 'financeiro', 'parcelas'];
                  const idx = order.indexOf(tab);
                  if (idx > 0) setTab(order[idx - 1]);
                }}
                disabled={submitting}
              >
                ← Voltar
              </Button>
            )}
            {tab !== 'parcelas' ? (
              <Button
                onClick={() => {
                  const order = ['beneficiario', 'pagador', 'financeiro', 'parcelas'];
                  const idx = order.indexOf(tab);
                  if (idx < order.length - 1) setTab(order[idx + 1]);
                }}
              >
                Próximo →
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gerar Boleto Parcelado
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ItemPickerProps {
  items: any[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  kind: 'service' | 'package';
}

function ItemPicker({ items, value, onChange, placeholder, kind }: ItemPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find(i => i.id === value);
  const label = selected
    ? `${selected.name} — R$ ${Number(kind === 'package' ? selected.price : selected.price).toFixed(2)}`
    : 'Selecione...';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[60] bg-popover">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {items.map(item => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.id}`}
                  onSelect={() => { onChange(item.id); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === item.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 flex items-center justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      R$ {Number(item.price).toFixed(2)}
                      {kind === 'package' && item.total_sessions ? ` · ${item.total_sessions}x` : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

