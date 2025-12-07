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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfessionals } from '@/hooks/useProfessionals';

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().trim().max(20, 'Telefone muito longo').optional(),
  specialties: z.string().optional(),
  bio: z.string().trim().max(500, 'Bio muito longa').optional(),
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
      email: '',
      phone: '',
      specialties: '',
      bio: '',
      is_active: true,
    },
  });

  const onSubmit = async (data: ProfessionalFormData) => {
    setIsLoading(true);
    try {
      const specialtiesArray = data.specialties
        ? data.specialties.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      if (editingId) {
        const { error } = await supabase
          .from('professionals')
          .update({
            name: data.name,
            email: data.email || null,
            phone: data.phone || null,
            specialties: specialtiesArray,
            bio: data.bio || null,
            is_active: data.is_active,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Profissional atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('professionals')
          .insert({
            name: data.name,
            email: data.email || null,
            phone: data.phone || null,
            specialties: specialtiesArray,
            bio: data.bio || null,
            is_active: data.is_active,
          });
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
      email: professional.email || '',
      phone: professional.phone || '',
      specialties: professional.specialties?.join(', ') || '',
      bio: professional.bio || '',
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
      <DialogContent className="sm:max-w-[500px]">
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