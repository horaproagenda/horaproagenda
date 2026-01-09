import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Edit, Trash2, ArrowLeft, Wrench, Search } from 'lucide-react';
import { toast } from 'sonner';

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
  const [searchQuery, setSearchQuery] = useState('');
  
  const { equipment, refetch } = useEquipment();

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.serial_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: '',
      description: '',
      serial_number: '',
      is_active: true,
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setShowForm(false);
      setEditingId(null);
      setSearchQuery('');
      form.reset();
    }
  };

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
    if (!confirm('Tem certeza que deseja excluir este equipamento?')) return;
    
    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Equipamento excluído com sucesso!');
      refetch();
    } catch (error: any) {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Não é possível excluir: equipamento possui dados vinculados no sistema.');
      } else {
        toast.error('Erro ao excluir equipamento: ' + error.message);
      }
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Wrench className="h-4 w-4 mr-2" />
            Gerenciar Equipamentos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle className="text-lg font-semibold">
            {showForm ? (editingId ? 'Editar Equipamento' : 'Novo Equipamento') : 'Gerenciar Equipamentos'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {showForm 
              ? 'Preencha os dados do equipamento.'
              : 'Cadastre e gerencie os equipamentos disponíveis.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {showForm ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do equipamento" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serial_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Número de Série</FormLabel>
                      <FormControl>
                        <Input placeholder="Número de série" className="h-9 text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Descrição</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Descrição do equipamento" 
                          className="min-h-[70px] text-sm resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium">Ativo</FormLabel>
                        <p className="text-[10px] text-muted-foreground">
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

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                    }}
                    className="flex-1 gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                  <Button type="submit" size="sm" disabled={isLoading} className="flex-1">
                    {isLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou série..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Button onClick={handleAddNew} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" />
                  Novo
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {filteredEquipment.length} equipamento(s) encontrado(s)
              </p>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {filteredEquipment.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {searchQuery ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}
                  </p>
                ) : (
                  filteredEquipment.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          {!item.is_active && (
                            <Badge variant="secondary" className="text-[10px]">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        {item.serial_number && (
                          <p className="text-xs text-muted-foreground">
                            S/N: {item.serial_number}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(item)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
