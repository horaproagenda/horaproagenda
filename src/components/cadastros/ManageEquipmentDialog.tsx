import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Edit, Trash2, ArrowLeft, Wrench } from 'lucide-react';
import { toast } from 'sonner';

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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useEquipment } from '@/hooks/useEquipment';

const equipmentSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  serial_number: z.string().optional(),
  is_active: z.boolean().default(true),
});

type EquipmentFormData = z.infer<typeof equipmentSchema>;

interface ManageEquipmentDialogProps {
  children?: React.ReactNode;
}

export function ManageEquipmentDialog({ children }: ManageEquipmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { equipment, refetch } = useEquipment();

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: '',
      description: '',
      serial_number: '',
      is_active: true,
    },
  });

  const onSubmit = async (data: EquipmentFormData) => {
    setIsLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('equipment')
          .update({
            name: data.name,
            description: data.description || null,
            serial_number: data.serial_number || null,
            is_active: data.is_active,
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Equipamento atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('equipment')
          .insert({
            name: data.name,
            description: data.description || null,
            serial_number: data.serial_number || null,
            is_active: data.is_active,
          });

        if (error) throw error;
        toast.success('Equipamento cadastrado com sucesso!');
      }

      form.reset();
      setShowForm(false);
      setEditingId(null);
      refetch();
    } catch (error) {
      console.error('Error saving equipment:', error);
      toast.error('Erro ao salvar equipamento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (item: typeof equipment[0]) => {
    form.reset({
      name: item.name,
      description: item.description || '',
      serial_number: item.serial_number || '',
      is_active: item.is_active,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Equipamento excluído com sucesso!');
      refetch();
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast.error('Erro ao excluir equipamento');
    }
  };

  const handleAddNew = () => {
    form.reset({
      name: '',
      description: '',
      serial_number: '',
      is_active: true,
    });
    setEditingId(null);
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Wrench className="h-4 w-4 mr-2" />
            Gerenciar Equipamentos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {showForm ? (editingId ? 'Editar Equipamento' : 'Novo Equipamento') : 'Gerenciar Equipamentos'}
          </DialogTitle>
        </DialogHeader>

        {showForm ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do equipamento" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serial_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Série</FormLabel>
                    <FormControl>
                      <Input placeholder="Número de série" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Descrição do equipamento" 
                        className="min-h-[80px]"
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
                    <div className="space-y-0.5">
                      <FormLabel>Ativo</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Equipamento disponível para uso
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

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="flex-1"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <Button onClick={handleAddNew} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Equipamento
            </Button>

            <div className="space-y-2">
              {equipment.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum equipamento cadastrado
                </p>
              ) : (
                equipment.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {!item.is_active && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                      {item.serial_number && (
                        <p className="text-sm text-muted-foreground">
                          S/N: {item.serial_number}
                        </p>
                      )}
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
