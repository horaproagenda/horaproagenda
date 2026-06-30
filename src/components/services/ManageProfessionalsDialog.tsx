import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Plus, Trash2, Edit2, Shield, ChevronDown, ChevronRight, Search, Eye, Settings2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useAuth } from '@/contexts/AuthContext';
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';
import { ProfessionalServiceCommissionDialog } from './ProfessionalServiceCommissionDialog';
import { ProfessionalCredentialView } from './ProfessionalCredentialView';
import {
  AGENDA_COLOR_PALETTE,
  DEFAULT_AGENDA_COLOR,
  pickNextAvailableColor,
  getAgendaColorLabel,
} from '@/lib/agendaColors';

const AGENDA_COLORS = AGENDA_COLOR_PALETTE;


const APP_ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'professional', label: 'Profissional' },
];

const PERMISSIONS_CONFIG = [
  { key: 'can_access_financial', label: 'Acessar Financeiro', description: 'Ver módulo financeiro e movimentações', category: 'financial' },
  { key: 'can_manage_payments', label: 'Dar baixa em pagamentos', description: 'Registrar e alterar pagamentos', category: 'financial' },
  { key: 'can_view_other_payments', label: 'Ver pagamentos de outros profissionais', description: 'Visualizar pagamentos de outros', category: 'financial' },
  { key: 'can_view_other_registers', label: 'Ver caixa de outros profissionais', description: 'Acessar movimentações de caixa de outros', category: 'financial' },
  { key: 'can_open_close_register', label: 'Abrir e fechar caixa', description: 'Iniciar e finalizar movimento de caixa', category: 'financial' },
  { key: 'can_view_daily_revenue', label: 'Ver lucro/receita do dia', description: 'Visualizar valores financeiros totais', category: 'financial' },
  { key: 'can_view_other_clients', label: 'Ver clientes de todos', description: 'Acesso a todos os clientes', category: 'clients' },
  { key: 'can_view_only_own_clients', label: 'Ver somente próprios clientes', description: 'Acesso restrito aos seus clientes', category: 'clients' },
  { key: 'can_view_other_agendas', label: 'Ver agenda de todos', description: 'Visualizar agendamentos de todos', category: 'agenda' },
  { key: 'can_view_only_own_agenda', label: 'Ver somente própria agenda', description: 'Acesso restrito à sua agenda', category: 'agenda' },
  { key: 'can_modify_agenda', label: 'Alterar agenda (criar/editar/excluir)', description: 'Modificar qualquer agendamento', category: 'agenda' },
  { key: 'can_manage_products', label: 'Cadastrar e editar produtos', description: 'Gerenciar estoque de produtos', category: 'products' },
  { key: 'can_view_other_products', label: 'Ver produtos de todos', description: 'Acesso a todos os produtos da agenda', category: 'products' },
  { key: 'can_view_only_own_products', label: 'Ver somente próprios produtos', description: 'Vê apenas os produtos que cadastrou', category: 'products' },
  { key: 'can_view_other_reports', label: 'Ver relatórios de todos', description: 'Acessar relatórios de outros profissionais', category: 'reports' },
  { key: 'can_view_only_own_reports', label: 'Ver somente próprios relatórios', description: 'Acesso restrito aos seus relatórios', category: 'reports' },
  { key: 'can_access_audit', label: 'Acessar Auditoria', description: 'Ver logs de ações do sistema', category: 'system' },
  { key: 'can_access_settings', label: 'Acessar Configurações', description: 'Alterar configurações do sistema', category: 'system' },
];

const defaultPermissions = {
  can_access_financial: false,
  can_manage_payments: false,
  can_view_other_payments: false,
  can_view_other_registers: false,
  can_open_close_register: false,
  can_view_daily_revenue: false,
  can_view_other_clients: false,
  can_view_only_own_clients: true,
  can_view_other_agendas: false,
  can_view_only_own_agenda: true,
  can_modify_agenda: false,
  can_manage_products: false,
  can_view_other_products: false,
  can_view_only_own_products: true,
  can_view_other_reports: false,
  can_view_only_own_reports: true,
  can_access_audit: false,
  can_access_settings: false,
};

const PERMISSION_CATEGORIES = [
  { key: 'financial', label: 'Financeiro', icon: '💰' },
  { key: 'clients', label: 'Clientes', icon: '👥' },
  { key: 'agenda', label: 'Agenda', icon: '📅' },
  { key: 'products', label: 'Produtos', icon: '📦' },
  { key: 'reports', label: 'Relatórios', icon: '📊' },
  { key: 'system', label: 'Sistema', icon: '⚙️' },
];

const COMMISSION_TYPES = [
  { value: 'percentage', label: 'Porcentagem' },
  { value: 'fixed', label: 'Valor Fixo' },
  { value: 'both', label: 'Ambos (por serviço)' },
];

const COMMISSION_FREQUENCIES = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  cpf: z.string().trim().optional().refine(
    (val) => !val || val === '' || isValidCPF(val),
    { message: 'CPF inválido. Verifique os números digitados.' }
  ),
  birthdate: z.string().optional(),
  email: z.string().trim().email('Email inválido'),
  password: z.string().optional(),
  require_password_change: z.boolean().default(true),
  store_temp_password: z.boolean().default(true),
  phone: z.string().trim().max(20, 'Telefone muito longo').optional(),
  whatsapp_from_number: z.string().trim().max(60, 'Número muito longo').optional(),
  specialties: z.string().optional(),
  bio: z.string().trim().max(500, 'Bio muito longa').optional(),
  agenda_color: z.string().default('#3B82F6'),
  app_role: z.string().default('professional'),
  is_commission_based: z.boolean().default(false),
  commission_type: z.string().default('percentage'),
  commission_percentage: z.coerce.number().min(0).max(100).default(0),
  commission_fixed_value: z.coerce.number().min(0).default(0),
  commission_frequency: z.string().default('monthly'),
  commission_payment_day: z.coerce.number().min(0).max(31).default(1),
  is_active: z.boolean(),
  permissions: z.record(z.boolean()).default(defaultPermissions),
});

type ProfessionalFormData = z.infer<typeof professionalSchema>;

interface ManageProfessionalsDialogProps {
  children?: React.ReactNode;
}

export function ManageProfessionalsDialog({ children }: ManageProfessionalsDialogProps) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { professionals, refetch } = useProfessionals();

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setShowForm(false);
      setEditingId(null);
      setSearchQuery('');
    }
  };

  const filteredProfessionals = professionals.filter(prof => 
    prof.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    prof.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    prof.specialties?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      name: '',
      cpf: '',
      birthdate: '',
      email: '',
      password: '',
      require_password_change: true,
      store_temp_password: true,
      phone: '',
      whatsapp_from_number: '',
      specialties: '',
      bio: '',
      agenda_color: DEFAULT_AGENDA_COLOR,
      app_role: 'professional',
      is_commission_based: false,
      commission_type: 'percentage',
      commission_percentage: 0,
      commission_fixed_value: 0,
      commission_frequency: 'monthly',
      commission_payment_day: 1,
      is_active: true,
      permissions: defaultPermissions,
    },
  });

  const isCommissionBased = form.watch('is_commission_based');
  const commissionType = form.watch('commission_type');
  const commissionFrequency = form.watch('commission_frequency');
  const appRole = form.watch('app_role');
  const permissions = form.watch('permissions');

  const onSubmit = async (data: ProfessionalFormData) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem cadastrar ou editar profissionais.');
      return;
    }
    setIsLoading(true);
    try {
      const specialtiesArray = data.specialties
        ? data.specialties.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const payload: any = {
        name: data.name,
        cpf: data.cpf ? formatCPF(data.cpf) : null,
        birthdate: data.birthdate || null,
        email: data.email || null,
        phone: data.phone || null,
        whatsapp_from_number: data.whatsapp_from_number || null,
        specialties: specialtiesArray,
        bio: data.bio || null,
        agenda_color: data.agenda_color,
        app_role: data.app_role,
        is_commission_based: data.is_commission_based,
        commission_type: data.is_commission_based ? data.commission_type : 'percentage',
        commission_percentage: data.is_commission_based ? data.commission_percentage : 0,
        commission_fixed_value: data.is_commission_based ? data.commission_fixed_value : 0,
        commission_frequency: data.is_commission_based ? data.commission_frequency : 'monthly',
        commission_payment_day: data.is_commission_based ? data.commission_payment_day : 1,
        is_active: data.is_active,
        permissions: data.app_role === 'admin' 
          ? Object.fromEntries(PERMISSIONS_CONFIG.map(p => [p.key, true]))
          : data.permissions,
      };

      if (editingId) {
        const { error } = await supabase
          .from('professionals')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        // If password provided when editing, also update auth user via edge function
        if (data.password && data.password.length >= 8) {
          const { error: fnErr } = await supabase.functions.invoke('admin-create-professional', {
            body: {
              email: data.email, password: data.password, full_name: data.name,
              professional_id: editingId, payload,
              require_password_change: data.require_password_change,
              store_temp_password: data.store_temp_password,
            },
          });
          if (fnErr) throw fnErr;
        }
        toast.success('Profissional atualizado com sucesso!');
      } else {
        if (!data.password || data.password.length < 8) {
          toast.error('Defina uma senha de pelo menos 8 caracteres para o profissional.');
          setIsLoading(false);
          return;
        }
        const { data: result, error } = await supabase.functions.invoke('admin-create-professional', {
          body: {
            email: data.email, password: data.password, full_name: data.name, payload,
            require_password_change: data.require_password_change,
            store_temp_password: data.store_temp_password,
          },
        });
        if (error) throw error;
        if (result && (result as any).success === false) throw new Error((result as any).error || 'Erro ao criar profissional');
        toast.success('Profissional cadastrado! Ele pode acessar com o e-mail e senha definidos.');
      }

      form.reset();
      setShowForm(false);
      setEditingId(null);
      setPermissionsOpen(false);
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + (error.message || error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (professional: any) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem editar profissionais.');
      return;
    }
    setEditingId(professional.id);
    const existingPermissions = professional.permissions || defaultPermissions;
    form.reset({
      name: professional.name,
      cpf: professional.cpf || '',
      birthdate: professional.birthdate || '',
      email: professional.email || '',
      password: '',
      phone: professional.phone || '',
      whatsapp_from_number: professional.whatsapp_from_number || '',
      specialties: professional.specialties?.join(', ') || '',
      bio: professional.bio || '',
      agenda_color: professional.agenda_color || '#3B82F6',
      app_role: professional.app_role || 'professional',
      is_commission_based: professional.is_commission_based || false,
      commission_type: professional.commission_type || 'percentage',
      commission_percentage: professional.commission_percentage || 0,
      commission_fixed_value: professional.commission_fixed_value || 0,
      commission_frequency: professional.commission_frequency || 'monthly',
      commission_payment_day: professional.commission_payment_day || 1,
      is_active: professional.is_active,
      permissions: { ...defaultPermissions, ...existingPermissions },
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este profissional?')) return;

    // Check for linked data to warn the user before forcing
    const [{ count: svcCount }, { count: apptCount }, { count: pkgCount }, { count: finCount }] = await Promise.all([
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('professional_id', id),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('professional_id', id),
      supabase.from('service_packages').select('id', { count: 'exact', head: true }).eq('professional_id', id),
      supabase.from('financial_entries').select('id', { count: 'exact', head: true }).eq('professional_id', id),
    ]);

    const total = (svcCount || 0) + (apptCount || 0) + (pkgCount || 0) + (finCount || 0);
    if (total > 0) {
      const ok = confirm(
        `Este profissional possui dados vinculados:\n` +
        `• ${svcCount || 0} serviço(s)\n` +
        `• ${apptCount || 0} agendamento(s)\n` +
        `• ${pkgCount || 0} pacote(s)\n` +
        `• ${finCount || 0} lançamento(s) financeiro(s)\n\n` +
        `Os registros não serão apagados, apenas desvinculados do profissional. Deseja continuar?`
      );
      if (!ok) return;
    }

    try {
      const { error } = await supabase.rpc('force_delete_professional' as any, { _professional_id: id });
      if (error) throw error;
      toast.success('Profissional removido!');
      refetch();
    } catch (error: any) {
      toast.error('Erro ao remover: ' + (error.message || 'erro desconhecido'));
    }
  };

  const toggleAllPermissions = (value: boolean) => {
    const newPermissions = Object.fromEntries(PERMISSIONS_CONFIG.map(p => [p.key, value]));
    form.setValue('permissions', newPermissions);
  };

  const activePermissionsCount = Object.values(permissions || {}).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            Profissionais
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle>Gerenciar Profissionais</DialogTitle>
          <DialogDescription>
            Cadastre e gerencie os profissionais da equipe e suas permissões.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {!showForm ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email ou especialidade..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                {isAdmin && (
                  <Button onClick={() => setShowForm(true)} className="gap-2 btn-vibrant shrink-0">
                    <Plus className="h-4 w-4" />
                    Novo Profissional
                  </Button>
                )}
              </div>

              {!isAdmin && (
                <div className="rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  Apenas administradores podem cadastrar, editar ou excluir profissionais.
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                {filteredProfessionals.length} profissional(is) encontrado(s)
              </div>

              <div className="space-y-2">
                {filteredProfessionals.map(prof => (
                  <div
                    key={prof.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card card-hover"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: (prof as any).agenda_color || '#3B82F6' }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{prof.name}</span>
                          {!prof.is_active && (
                            <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                          )}
                        </div>
                        {prof.email && (
                          <p className="text-xs text-muted-foreground truncate">{prof.email}</p>
                        )}
                        {prof.specialties && prof.specialties.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {prof.specialties.slice(0, 2).map((spec: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[9px]">
                                {spec}
                              </Badge>
                            ))}
                            {prof.specialties.length > 2 && (
                              <Badge variant="outline" className="text-[9px]">
                                +{prof.specialties.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(prof as any).is_commission_based && (prof as any).commission_type === 'both' && (
                        <ProfessionalServiceCommissionDialog professionalId={prof.id} professionalName={prof.name}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Comissões por serviço">
                            <Settings2 className="h-4 w-4 text-amber-500" />
                          </Button>
                        </ProfessionalServiceCommissionDialog>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setOpen(false);
                          navigate(`/profissional/${prof.id}`);
                        }}
                        title="Ver perfil"
                      >
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                      {isAdmin && (
                        <ProfessionalCredentialView professionalId={prof.id} />
                      )}
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(prof)}
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDelete(prof.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {filteredProfessionals.length === 0 && (
                  <p className="text-center text-muted-foreground py-4 text-sm">
                    {searchQuery ? 'Nenhum profissional encontrado' : 'Nenhum profissional cadastrado'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Maria Silva" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">CPF</FormLabel>
                        <FormControl>
                          <Input placeholder="000.000.000-00" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthdate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Data de Nascimento</FormLabel>
                        <FormControl>
                          <Input type="date" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email de acesso *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@exemplo.com" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          {editingId ? 'Nova senha (opcional, mín. 8)' : 'Senha de acesso * (mín. 8)'}
                        </FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" autoComplete="new-password" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="require_password_change"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-2">
                        <div className="pr-2">
                          <FormLabel className="text-xs">Exigir troca no 1º login</FormLabel>
                          <p className="text-[10px] text-muted-foreground">Profissional define a própria senha</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="store_temp_password"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-2">
                        <div className="pr-2">
                          <FormLabel className="text-xs">Senha visível p/ admin</FormLabel>
                          <p className="text-[10px] text-amber-600">⚠️ Reduz a segurança</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">WhatsApp</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 99999-9999" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />


                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="agenda_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Cor na Agenda</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Selecione uma cor">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: field.value }}
                                  />
                                  <span className="text-xs">
                                    {AGENDA_COLORS.find(c => c.value === field.value)?.label}
                                  </span>
                                </div>
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {AGENDA_COLORS.map(color => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded"
                                    style={{ backgroundColor: color.value }}
                                  />
                                  <span className="text-xs">{color.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="app_role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Função no Sistema</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Selecione a função" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APP_ROLES.map(role => (
                              <SelectItem key={role.value} value={role.value} className="text-xs">
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="specialties"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Especialidades (separadas por vírgula)</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Estética, Massagem, Depilação" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Bio</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Breve descrição do profissional..."
                          className="resize-none text-sm min-h-[60px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="is_commission_based"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-xs">Recebe por Comissão</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {isCommissionBased && (
                    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="commission_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Tipo de Comissão</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-9 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {COMMISSION_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="commission_frequency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Frequência de Pagamento</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-9 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {COMMISSION_FREQUENCIES.map(f => (
                                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {(commissionType === 'percentage' || commissionType === 'both') && (
                          <FormField
                            control={form.control}
                            name="commission_percentage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Comissão Padrão (%)</FormLabel>
                                <FormControl>
                                  <Input type="number" min={0} max={100} step={0.5} placeholder="Ex: 30" className="h-9 text-sm" {...field} />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        )}

                        {(commissionType === 'fixed' || commissionType === 'both') && (
                          <FormField
                            control={form.control}
                            name="commission_fixed_value"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Valor Fixo Padrão (R$)</FormLabel>
                                <FormControl>
                                  <Input type="number" min={0} step={0.01} placeholder="Ex: 50,00" className="h-9 text-sm" {...field} />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name="commission_payment_day"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">
                              {commissionFrequency === 'monthly' ? 'Dia do Pagamento (1-31)' :
                               commissionFrequency === 'weekly' || commissionFrequency === 'biweekly' ? 'Dia da Semana (0=Dom, 6=Sáb)' :
                               'Dia de Pagamento'}
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min={0} 
                                max={commissionFrequency === 'monthly' ? 31 : 6}
                                placeholder={commissionFrequency === 'monthly' ? 'Ex: 5' : 'Ex: 1 (Segunda)'}
                                className="h-9 text-sm" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      {commissionType === 'both' && (
                        <p className="text-[10px] text-muted-foreground">
                          💡 Com "Ambos", ao vincular o profissional a um serviço, será configurado se recebe porcentagem ou valor fixo naquele serviço específico.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-xs">Profissional Ativo</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                {/* Permissions Section - Always visible */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Permissões de Acesso</span>
                      {activePermissionsCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {activePermissionsCount} ativas
                        </Badge>
                      )}
                    </div>
                    {appRole !== 'admin' && (
                      <div className="flex gap-1">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[10px] px-2"
                          onClick={() => toggleAllPermissions(true)}
                        >
                          Marcar Todas
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[10px] px-2"
                          onClick={() => toggleAllPermissions(false)}
                        >
                          Desmarcar
                        </Button>
                      </div>
                    )}
                  </div>

                  {appRole === 'admin' ? (
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <p className="text-xs text-primary font-medium">
                        ✓ Administradores possuem acesso total a todas as funções do sistema.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {PERMISSION_CATEGORIES.map((category) => {
                        const categoryPerms = PERMISSIONS_CONFIG.filter(p => p.category === category.key);
                        if (categoryPerms.length === 0) return null;
                        
                        return (
                          <div key={category.key} className="rounded-lg border bg-card overflow-hidden">
                            <div className="px-3 py-2 bg-muted/50 border-b">
                              <span className="text-xs font-medium flex items-center gap-2">
                                <span>{category.icon}</span>
                                {category.label}
                              </span>
                            </div>
                            <div className="p-2 space-y-1">
                              {categoryPerms.map((perm) => (
                                <div 
                                  key={perm.key} 
                                  className="flex items-center justify-between p-2 rounded hover:bg-muted/30 transition-colors"
                                >
                                  <div className="flex-1 min-w-0 pr-3">
                                    <p className="text-xs font-medium truncate">{perm.label}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{perm.description}</p>
                                  </div>
                                  <Switch
                                    checked={permissions?.[perm.key] || false}
                                    onCheckedChange={(checked) => {
                                      const newPermissions = { ...permissions, [perm.key]: checked };
                                      
                                      // Handle mutual exclusivity for "own only" vs "all" permissions
                                      if (perm.key === 'can_view_other_clients' && checked) {
                                        newPermissions.can_view_only_own_clients = false;
                                      }
                                      if (perm.key === 'can_view_only_own_clients' && checked) {
                                        newPermissions.can_view_other_clients = false;
                                      }
                                      if (perm.key === 'can_view_other_agendas' && checked) {
                                        newPermissions.can_view_only_own_agenda = false;
                                      }
                                      if (perm.key === 'can_view_only_own_agenda' && checked) {
                                        newPermissions.can_view_other_agendas = false;
                                      }
                                      if (perm.key === 'can_view_other_reports' && checked) {
                                        newPermissions.can_view_only_own_reports = false;
                                      }
                                      if (perm.key === 'can_view_only_own_reports' && checked) {
                                        newPermissions.can_view_other_reports = false;
                                      }
                                      
                                      form.setValue('permissions', newPermissions);
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setPermissionsOpen(false);
                      form.reset();
                    }}
                  >
                    Voltar
                  </Button>
                  <Button type="submit" size="sm" disabled={isLoading} className="btn-vibrant">
                    {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}