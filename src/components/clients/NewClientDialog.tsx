import { useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { DuplicateClientAlert } from './DuplicateClientAlert';
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';
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

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo').or(z.literal('')),
  phone: z.string().trim().min(10, 'Telefone deve ter pelo menos 10 dígitos').max(20, 'Telefone muito longo'),
  cpf: z.string().trim().optional().refine((val) => {
    if (!val || val === '') return true;
    return isValidCPF(val);
  }, 'CPF inválido'),
  birthdate: z.string().optional(),
  notes: z.string().trim().max(500, 'Observações muito longas').optional(),
  is_active: z.boolean().default(true),
  referral_source: z.string().optional(),
  assigned_professional_id: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientDialogProps {
  onClientCreated?: () => void;
  children?: React.ReactNode;
}

export function NewClientDialog({ onClientCreated, children }: NewClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { clients } = useClients();
  const { professionalId, isProfessional } = useCurrentProfessional();
  const { professionals } = useProfessionals();
  const { hasRole } = useAuth();
  
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');
  const activeProfessionals = professionals.filter(p => p.is_active);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      cpf: '',
      birthdate: '',
      notes: '',
      is_active: true,
      referral_source: '',
      assigned_professional_id: '',
    },
  });

  const watchedName = useWatch({ control: form.control, name: 'name' });
  const watchedPhone = useWatch({ control: form.control, name: 'phone' });
  const watchedEmail = useWatch({ control: form.control, name: 'email' });
  const watchedCpf = useWatch({ control: form.control, name: 'cpf' });

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

  const hasDuplicates = duplicatesByName.length > 0 || duplicatesByPhone.length > 0 || duplicatesByEmail.length > 0 || duplicatesByCpf.length > 0;

  const onSubmit = async (data: ClientFormData) => {
    if (hasDuplicates) {
      const confirmSubmit = window.confirm(
        'Foram encontrados clientes com dados similares. Deseja continuar com o cadastro mesmo assim?'
      );
      if (!confirmSubmit) return;
    }

    setIsLoading(true);
    try {
      // Determine which professional to assign
      let assignedProfessionalId: string | null = null;
      if (isProfessional) {
        assignedProfessionalId = professionalId;
      } else if (isAdminOrReceptionist && data.assigned_professional_id) {
        assignedProfessionalId = data.assigned_professional_id;
      }

      const { error } = await supabase.from('clients').insert({
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        cpf: data.cpf ? formatCPF(data.cpf) : null,
        birthdate: data.birthdate || null,
        notes: data.notes || null,
        is_active: data.is_active,
        referral_source: data.referral_source || null,
        assigned_professional_id: assignedProfessionalId,
      });

      if (error) throw error;

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button size="sm" className="gap-1.5 btn-vibrant">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="text-xs">Novo Cliente</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Cliente</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Name & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" className="h-8 text-sm" {...field} />
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
            
            {/* CPF & Email */}
            <div className="grid grid-cols-2 gap-3">
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
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
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

            {/* Birthdate & Referral */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="birthdate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Data de Nascimento</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="referral_source"
                render={({ field }) => (
                  <FormItem>
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
