import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Plus, Trash2, Edit2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfessionals } from '@/hooks/useProfessionals';

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

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  cpf: z.string().trim().max(14, 'CPF inválido').optional(),
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
    },
  });

  const isCommissionBased = form.watch('is_commission_based');

  const onSubmit = async (data: ProfessionalFormData) => {
    setIsLoading(true);
    try {
      const specialtiesArray = data.specialties
        ? data.specialties.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        name: data.name,
        cpf: data.cpf || null,
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
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (professional: any) => {
    setEditingId(professional.id);
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
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('professionals').delete().eq('id', id);
      if (error) throw error;
      toast.success('Profissional removido!');
      refetch();
    } catch (error: any) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Profissionais</DialogTitle>
          <DialogDescription>
            Cadastre e gerencie os profissionais da equipe.
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <Button onClick={() => setShowForm(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Novo Profissional
            </Button>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {professionals.map(prof => (
                <div
                  key={prof.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: (prof as any).agenda_color || '#3B82F6' }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{prof.name}</span>
                        {!prof.is_active && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      {prof.email && (
                        <p className="text-xs text-muted-foreground">{prof.email}</p>
                      )}
                      {prof.specialties && prof.specialties.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {prof.specialties.map((spec: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(prof)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(prof.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {professionals.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
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
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Maria Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input placeholder="000.000.000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Nascimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="email@exemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 99999-9999" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="agenda_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor na Agenda</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma cor">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: field.value }}
                                />
                                {AGENDA_COLORS.find(c => c.value === field.value)?.label}
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AGENDA_COLORS.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: color.value }}
                                />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="app_role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Função no Sistema</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a função" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {APP_ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="specialties"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidades (separadas por vírgula)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Estética, Massagem, Depilação" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Breve descrição do profissional..."
                        className="resize-none"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_commission_based"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel>Recebe por Comissão</FormLabel>
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
                      <FormLabel>Percentual de Comissão (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0} 
                          max={100} 
                          step={0.5}
                          placeholder="Ex: 30" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel>Profissional Ativo</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    form.reset();
                  }}
                >
                  Voltar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
