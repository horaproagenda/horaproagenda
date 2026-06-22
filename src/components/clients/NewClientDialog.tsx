import { useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Loader2 } from 'lucide-react';
import { parseLooseDateToISO } from '@/lib/dateInputPaste';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { DuplicateClientAlert } from './DuplicateClientAlert';
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';
import { validateCNPJ } from '@/lib/validationSchemas';
import { fetchAddressByCep, formatCep } from '@/lib/viacep';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';

const REFERRAL_SOURCES = [
  'Instagram',
  'Facebook',
  'Google',
  'Indicação de amigo',
  'Indicação de cliente',
  'Passou na frente',
  'WhatsApp',
  'TikTok',
  'Outros',
];

const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const formatCnpj = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const clientSchema = z.object({
  person_type: z.enum(['pf', 'pj']).default('pf'),
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo').or(z.literal('')),
  phone: z.string().trim().min(10, 'Telefone deve ter pelo menos 10 dígitos').max(20, 'Telefone muito longo'),
  cpf: z.string().trim().optional().refine((val) => {
    if (!val || val === '') return true;
    return isValidCPF(val);
  }, 'CPF inválido'),
  cnpj: z.string().trim().optional().refine((val) => {
    if (!val || val === '') return true;
    return validateCNPJ(val);
  }, 'CNPJ inválido (deve ter 14 dígitos)'),
  company_name: z.string().trim().max(150, 'Razão social muito longa').optional(),
  birthdate: z.string().optional(),
  notes: z.string().trim().max(500, 'Observações muito longas').optional(),
  is_active: z.boolean().default(true),
  referral_source: z.string().optional(),
  assigned_professional_id: z.string().optional(),
  // Address
  cep: z.string().trim().optional().refine((val) => {
    if (!val) return true;
    const digits = val.replace(/\D/g, '');
    return digits.length === 0 || digits.length === 8;
  }, 'CEP deve ter 8 dígitos'),
  address_street: z.string().trim().max(200).optional(),
  address_number: z.string().trim().max(20).optional(),
  address_complement: z.string().trim().max(100).optional(),
  address_neighborhood: z.string().trim().max(100).optional(),
  address_city: z.string().trim().max(100).optional(),
  address_state: z.string().trim().max(2).optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientDialogProps {
  onClientCreated?: () => void;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewClientDialog({ onClientCreated, children, open: openProp, onOpenChange }: NewClientDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange ? onOpenChange(v) : setInternalOpen(v); };
  const [isLoading, setIsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const { clients } = useClients();
  const { professionalId, isProfessional } = useCurrentProfessional();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');
  const activeProfessionals = professionals.filter(p => p.is_active);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      person_type: 'pf',
      name: '',
      email: '',
      phone: '',
      cpf: '',
      cnpj: '',
      company_name: '',
      birthdate: '',
      notes: '',
      is_active: true,
      referral_source: '',
      assigned_professional_id: '',
      cep: '',
      address_street: '',
      address_number: '',
      address_complement: '',
      address_neighborhood: '',
      address_city: '',
      address_state: '',
    },
  });

  const watchedName = useWatch({ control: form.control, name: 'name' });
  const watchedPhone = useWatch({ control: form.control, name: 'phone' });
  const watchedEmail = useWatch({ control: form.control, name: 'email' });
  const watchedCpf = useWatch({ control: form.control, name: 'cpf' });
  const watchedCnpj = useWatch({ control: form.control, name: 'cnpj' });
  const personType = useWatch({ control: form.control, name: 'person_type' });

  const duplicatesByName = useMemo(() => {
    if (!watchedName || watchedName.length < 3) return [];
    const searchTerm = watchedName.toLowerCase().trim();
    return clients.filter(client => 
      client.name.toLowerCase().includes(searchTerm) || 
      searchTerm.includes(client.name.toLowerCase())
    ).slice(0, 3);
  }, [watchedName, clients]);

  const duplicatesByPhone = useMemo(() => {
    if (!watchedPhone || watchedPhone.length < 8) return [];
    const cleanPhone = watchedPhone.replace(/\D/g, '');
    return clients.filter(client => {
      const clientPhone = client.phone?.replace(/\D/g, '') || '';
      return clientPhone.includes(cleanPhone) || cleanPhone.includes(clientPhone);
    }).slice(0, 3);
  }, [watchedPhone, clients]);

  const duplicatesByEmail = useMemo(() => {
    if (!watchedEmail || watchedEmail.length < 5 || !watchedEmail.includes('@')) return [];
    const searchEmail = watchedEmail.toLowerCase().trim();
    return clients.filter(client => 
      client.email?.toLowerCase() === searchEmail
    ).slice(0, 3);
  }, [watchedEmail, clients]);

  const duplicatesByCpf = useMemo(() => {
    if (!watchedCpf || watchedCpf.length < 11) return [];
    const cleanCpf = watchedCpf.replace(/\D/g, '');
    return clients.filter(client => {
      const clientCpf = client.cpf?.replace(/\D/g, '') || '';
      return clientCpf === cleanCpf;
    }).slice(0, 3);
  }, [watchedCpf, clients]);

  const duplicatesByCnpj = useMemo(() => {
    const digits = (watchedCnpj || '').replace(/\D/g, '');
    if (digits.length < 14) return [];
    return clients.filter((client: any) => {
      const c = (client.cnpj || '').replace(/\D/g, '');
      return c === digits;
    }).slice(0, 3);
  }, [watchedCnpj, clients]);

  const hasDuplicates =
    duplicatesByName.length > 0 ||
    duplicatesByPhone.length > 0 ||
    duplicatesByEmail.length > 0 ||
    duplicatesByCpf.length > 0 ||
    duplicatesByCnpj.length > 0;

  const handleCepBlur = async (value: string) => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const result = await fetchAddressByCep(digits);
      if (!result) {
        toast.error('CEP não encontrado.');
        return;
      }
      form.setValue('address_street', result.logradouro || '', { shouldValidate: true });
      form.setValue('address_neighborhood', result.bairro || '', { shouldValidate: true });
      form.setValue('address_city', result.localidade || '', { shouldValidate: true });
      form.setValue('address_state', (result.uf || '').toUpperCase(), { shouldValidate: true });
      if (result.complemento) {
        form.setValue('address_complement', result.complemento, { shouldValidate: true });
      }
    } catch {
      toast.error('Falha ao consultar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const onSubmit = async (data: ClientFormData) => {
    if (data.person_type === 'pj' && !data.cnpj) {
      form.setError('cnpj', { message: 'CNPJ é obrigatório para Pessoa Jurídica' });
      return;
    }

    if (hasDuplicates) {
      const confirmSubmit = window.confirm(
        'Foram encontrados clientes com dados similares. Deseja continuar com o cadastro mesmo assim?'
      );
      if (!confirmSubmit) return;
    }

    setIsLoading(true);
    try {
      let assignedProfessionalId: string | null = null;
      if (isProfessional) {
        assignedProfessionalId = professionalId;
      } else if (isAdminOrReceptionist && data.assigned_professional_id) {
        assignedProfessionalId = data.assigned_professional_id;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Usuário não autenticado');
      }

      const cepDigits = data.cep ? data.cep.replace(/\D/g, '') : '';

      const response = await fetch(
        'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/create-client',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            cpf: data.person_type === 'pf' && data.cpf ? formatCPF(data.cpf) : null,
            cnpj: data.person_type === 'pj' && data.cnpj ? data.cnpj.replace(/\D/g, '') : null,
            company_name: data.person_type === 'pj' ? (data.company_name || null) : null,
            birthdate: data.person_type === 'pf' ? (data.birthdate || null) : null,
            notes: data.notes || null,
            is_active: data.is_active,
            referral_source: data.referral_source || null,
            assigned_professional_id: assignedProfessionalId,
            cep: cepDigits || null,
            address_street: data.address_street || null,
            address_number: data.address_number || null,
            address_complement: data.address_complement || null,
            address_neighborhood: data.address_neighborhood || null,
            address_city: data.address_city || null,
            address_state: data.address_state ? data.address_state.toUpperCase() : null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.errors?.[0]?.message || 'Erro ao cadastrar cliente');
      }

      toast.success('Cliente cadastrado com sucesso!');
      form.reset();
      setOpen(false);
      onClientCreated?.();
    } catch (error: any) {
      toast.error('Erro ao cadastrar cliente: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isPJ = personType === 'pj';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && (
        <DialogTrigger asChild>
          {children || (
            <Button size="sm" className="gap-1.5 btn-vibrant">
              <UserPlus className="h-3.5 w-3.5" />
              <span className="text-xs">Novo Cliente</span>
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-5 py-3 text-white rounded-t-lg">
          <DialogTitle className="text-base text-white">Novo Cliente</DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 pt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Person Type */}
            <FormField
              control={form.control}
              name="person_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Tipo de cadastro</FormLabel>
                  <FormControl>
                    <Tabs
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as 'pf' | 'pj')}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 h-8">
                        <TabsTrigger value="pf" className="text-xs">Pessoa Física</TabsTrigger>
                        <TabsTrigger value="pj" className="text-xs">Pessoa Jurídica</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Name & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{isPJ ? 'Nome do contato *' : 'Nome *'}</FormLabel>
                    <FormControl>
                      <Input placeholder={isPJ ? 'Responsável' : 'Nome completo'} className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Telefone *</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {(duplicatesByName.length > 0 || duplicatesByPhone.length > 0) && (
              <DuplicateClientAlert 
                duplicates={[...duplicatesByName, ...duplicatesByPhone.filter(p => !duplicatesByName.find(n => n.id === p.id))]} 
                matchType={duplicatesByName.length > 0 ? "name" : "phone"} 
              />
            )}

            {/* PJ-specific fields */}
            {isPJ && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">CNPJ *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00.000.000/0000-00"
                          className="h-8 text-sm"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(formatCnpj(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Razão Social</FormLabel>
                      <FormControl>
                        <Input placeholder="Empresa LTDA" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {duplicatesByCnpj.length > 0 && (
              <DuplicateClientAlert duplicates={duplicatesByCnpj} matchType="cpf" />
            )}

            {/* CPF & Email (PF) | Email only (PJ shows CPF hidden) */}
            <div className="grid grid-cols-2 gap-3">
              {!isPJ && (
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">CPF</FormLabel>
                      <FormControl>
                        <Input placeholder="000.000.000-00" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className={isPJ ? 'col-span-2' : ''}>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {(duplicatesByCpf.length > 0 || duplicatesByEmail.length > 0) && (
              <DuplicateClientAlert 
                duplicates={[...duplicatesByCpf, ...duplicatesByEmail.filter(e => !duplicatesByCpf.find(c => c.id === e.id))]} 
                matchType={duplicatesByCpf.length > 0 ? "cpf" : "email"} 
              />
            )}

            {/* Birthdate (PF only) & Referral */}
            <div className="grid grid-cols-2 gap-3">
              {!isPJ && (
                <FormField
                  control={form.control}
                  name="birthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Data de Nascimento</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="h-8 text-sm"
                          {...field}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData('text');
                            const iso = parseLooseDateToISO(text);
                            if (iso) {
                              e.preventDefault();
                              field.onChange(iso);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="referral_source"
                render={({ field }) => (
                  <FormItem className={isPJ ? 'col-span-2' : ''}>
                    <FormLabel className="text-xs">Como conheceu?</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REFERRAL_SOURCES.map((source) => (
                          <SelectItem key={source} value={source} className="text-sm">
                            {source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Address Section */}
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Endereço</p>

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="cep"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-xs flex items-center gap-1">
                        CEP {cepLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00000-000"
                          className="h-8 text-sm"
                          value={field.value || ''}
                          onChange={(e) => {
                            const formatted = formatCep(e.target.value);
                            field.onChange(formatted);
                            if (formatted.replace(/\D/g, '').length === 8) {
                              handleCepBlur(formatted);
                            }
                          }}
                          onBlur={(e) => handleCepBlur(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_street"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs">Rua / Avenida</FormLabel>
                      <FormControl>
                        <Input placeholder="Logradouro" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="address_number"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-xs">Número</FormLabel>
                      <FormControl>
                        <Input placeholder="123" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_complement"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="text-xs">Complemento</FormLabel>
                      <FormControl>
                        <Input placeholder="Apto, sala, etc." className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="address_neighborhood"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-xs">Bairro</FormLabel>
                      <FormControl>
                        <Input placeholder="Bairro" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_city"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-xs">Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Cidade" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_state"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-xs">UF</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          {UF_LIST.map((uf) => (
                            <SelectItem key={uf} value={uf} className="text-sm">
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {isAdminOrReceptionist && (
              <FormField
                control={form.control}
                name="assigned_professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Profissional Responsável</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeProfessionals.map((professional) => (
                          <SelectItem key={professional.id} value={professional.id} className="text-sm">
                            {professional.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-2">
                  <div>
                    <FormLabel className="text-xs">Status</FormLabel>
                    <p className="text-[10px] text-muted-foreground">
                      {field.value ? 'Cliente ativo' : 'Cliente inativo'}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Alergias, preferências, etc."
                      className="resize-none h-14 text-sm"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="btn-vibrant" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
