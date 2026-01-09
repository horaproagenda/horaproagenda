import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Plus, Trash2, Edit2, Shield, ChevronDown, ChevronRight } from 'lucide-react';
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
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';

const AGENDA_COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Amarelo' },
  { value: '#EF4444', label: 'Vermelho' },
  { value: '#8B5CF6', label: 'Roxo' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#06B6D4', label: 'Ciano' },
  { value: '#F97316', label: 'Laranja' },
];

const APP_ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'professional', label: 'Profissional' },
];

const PERMISSIONS_CONFIG = [
  { key: 'can_manage_payments', label: 'Dar baixa em pagamentos', description: 'Pode registrar e alterar pagamentos' },
  { key: 'can_view_other_agendas', label: 'Ver agenda de outros profissionais', description: 'Visualizar agendamentos de outros' },
  { key: 'can_view_other_clients', label: 'Ver clientes de outros profissionais', description: 'Acessar dados de clientes de outros' },
  { key: 'can_view_daily_revenue', label: 'Ver lucro/receita do dia', description: 'Visualizar valores financeiros totais' },
  { key: 'can_open_close_register', label: 'Abrir e fechar caixa', description: 'Iniciar e finalizar movimento de caixa' },
  { key: 'can_modify_agenda', label: 'Alterar agenda (criar/editar/excluir)', description: 'Modificar qualquer agendamento' },
  { key: 'can_view_other_registers', label: 'Ver caixa de outros profissionais', description: 'Acessar movimentações de outros' },
  { key: 'can_manage_products', label: 'Cadastrar e editar produtos', description: 'Gerenciar estoque de produtos' },
  { key: 'can_view_other_reports', label: 'Ver relatórios de outros profissionais', description: 'Acessar relatórios completos' },
  { key: 'can_access_audit', label: 'Acessar Auditoria', description: 'Ver logs de ações do sistema' },
  { key: 'can_access_settings', label: 'Acessar Configurações', description: 'Alterar configurações do sistema' },
];

const defaultPermissions = {
  can_manage_payments: false,
  can_view_other_agendas: false,
  can_view_other_clients: false,
  can_view_daily_revenue: false,
  can_open_close_register: false,
  can_modify_agenda: false,
  can_view_other_registers: false,
  can_manage_products: false,
  can_view_other_reports: false,
  can_access_audit: false,
  can_access_settings: false,
};

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  cpf: z.string().trim().optional().refine(
    (val) => !val || val === '' || isValidCPF(val),
    { message: 'CPF inválido. Verifique os números digitados.' }
  ),
  birthdate: z.string().optional(),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().trim().max(20, 'Telefone muito longo').optional(),
  specialties: z.string().optional(),
  bio: z.string().trim().max(500, 'Bio muito longa').optional(),
  agenda_color: z.string().default('#3B82F6'),
  app_role: z.string().default('professional'),
  is_commission_based: z.boolean().default(false),
  commission_percentage: z.coerce.number().min(0).max(100).default(0),
  is_active: z.boolean(),
  permissions: z.record(z.boolean()).default(defaultPermissions),
});

type ProfessionalFormData = z.infer<typeof professionalSchema>;

interface ManageProfessionalsDialogProps {
  children?: React.ReactNode;
}

export function ManageProfessionalsDialog({ children }: ManageProfessionalsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const { professionals, refetch } = useProfessionals();

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      name: '',
      cpf: '',
      birthdate: '',
      email: '',
      phone: '',
      specialties: '',
      bio: '',
      agenda_color: '#3B82F6',
      app_role: 'professional',
      is_commission_based: false,
      commission_percentage: 0,
      is_active: true,
      permissions: defaultPermissions,
    },
  });

  const isCommissionBased = form.watch('is_commission_based');
  const appRole = form.watch('app_role');
  const permissions = form.watch('permissions');

  const onSubmit = async (data: ProfessionalFormData) => {
    setIsLoading(true);
    try {
      const specialtiesArray = data.specialties
        ? data.specialties.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        name: data.name,
        cpf: data.cpf ? formatCPF(data.cpf) : null,
        birthdate: data.birthdate || null,
        email: data.email || null,
        phone: data.phone || null,
        specialties: specialtiesArray,
        bio: data.bio || null,
        agenda_color: data.agenda_color,
        app_role: data.app_role,
        is_commission_based: data.is_commission_based,
        commission_percentage: data.is_commission_based ? data.commission_percentage : 0,
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
        toast.success('Profissional atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('professionals')
          .insert(payload);
        if (error) throw error;
        toast.success('Profissional cadastrado com sucesso!');
      }

      form.reset();
      setShowForm(false);
      setEditingId(null);
      setPermissionsOpen(false);
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (professional: any) => {
    setEditingId(professional.id);
    const existingPermissions = professional.permissions || defaultPermissions;
    form.reset({
      name: professional.name,
      cpf: professional.cpf || '',
      birthdate: professional.birthdate || '',
      email: professional.email || '',
      phone: professional.phone || '',
      specialties: professional.specialties?.join(', ') || '',
      bio: professional.bio || '',
      agenda_color: professional.agenda_color || '#3B82F6',
      app_role: professional.app_role || 'professional',
      is_commission_based: professional.is_commission_based || false,
      commission_percentage: professional.commission_percentage || 0,
      is_active: professional.is_active,
      permissions: { ...defaultPermissions, ...existingPermissions },
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este profissional?')) return;
    
    try {
      const { data: services } = await supabase
        .from('services')
        .select('id')
        .eq('professional_id', id)
        .limit(1);
      
      if (services && services.length > 0) {
        toast.error('Não é possível remover: profissional possui serviços vinculados.');
        return;
      }

      const { data: appointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('professional_id', id)
        .limit(1);
      
      if (appointments && appointments.length > 0) {
        toast.error('Não é possível remover: profissional possui agendamentos vinculados.');
        return;
      }

      const { error } = await supabase.from('professionals').delete().eq('id', id);
      if (error) throw error;
      toast.success('Profissional removido!');
      refetch();
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Não é possível remover: profissional possui dados vinculados no sistema.');
      } else {
        toast.error('Erro ao remover: ' + error.message);
      }
    }
  };

  const toggleAllPermissions = (value: boolean) => {
    const newPermissions = Object.fromEntries(PERMISSIONS_CONFIG.map(p => [p.key, value]));
    form.setValue('permissions', newPermissions);
  };

  const activePermissionsCount = Object.values(permissions || {}).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            Profissionais
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Gerenciar Profissionais</DialogTitle>
          <DialogDescription>
            Cadastre e gerencie os profissionais da equipe e suas permissões.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {!showForm ? (
            <div className="space-y-4">
              <Button onClick={() => setShowForm(true)} className="w-full gap-2 btn-vibrant">
                <Plus className="h-4 w-4" />
                Novo Profissional
              </Button>

              <div className="space-y-2">
                {professionals.map(prof => (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(prof)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(prof.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {professionals.length === 0 && (
                  <p className="text-center text-muted-foreground py-4 text-sm">
                    Nenhum profissional cadastrado
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
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl>
                          <Input placeholder="email@exemplo.com" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="(11) 99999-9999" className="h-9 text-sm" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

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

                <div className="grid grid-cols-2 gap-3">
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
                    <FormField
                      control={form.control}
                      name="commission_percentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Comissão (%)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={0} 
                              max={100} 
                              step={0.5}
                              placeholder="Ex: 30"
                              className="h-9 text-sm"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
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

                {/* Permissions Section */}
                <Collapsible open={permissionsOpen} onOpenChange={setPermissionsOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Permissões de Acesso</span>
                        {activePermissionsCount > 0 && (
                          <Badge variant="secondary" className="text-[9px]">
                            {activePermissionsCount} ativas
                          </Badge>
                        )}
                      </div>
                      {permissionsOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 p-3 rounded-lg border bg-card space-y-3">
                      {appRole === 'admin' ? (
                        <div className="p-2 rounded bg-primary/10 text-xs text-primary">
                          Administradores possuem todas as permissões automaticamente.
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">Selecionar permissões:</span>
                            <div className="flex gap-1">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[10px] px-2"
                                onClick={() => toggleAllPermissions(true)}
                              >
                                Todas
                              </Button>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[10px] px-2"
                                onClick={() => toggleAllPermissions(false)}
                              >
                                Nenhuma
                              </Button>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            {PERMISSIONS_CONFIG.map((perm) => (
                              <div 
                                key={perm.key} 
                                className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div>
                                  <p className="text-xs font-medium">{perm.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{perm.description}</p>
                                </div>
                                <Switch
                                  checked={permissions?.[perm.key] || false}
                                  onCheckedChange={(checked) => {
                                    form.setValue('permissions', {
                                      ...permissions,
                                      [perm.key]: checked,
                                    });
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}