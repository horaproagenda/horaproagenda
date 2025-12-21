import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BulkImportDialog } from './BulkImportDialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePackageTemplates } from '@/hooks/usePackageTemplates';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { PackageTemplate } from '@/types';

const templateSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  description: z.string().trim().optional(),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sessão'),
  price: z.coerce.number().min(0, 'Preço deve ser positivo'),
  duration: z.coerce.number().min(15, 'Mínimo 15 minutos'),
  interval_days: z.coerce.number().min(1, 'Mínimo 1 dia'),
  professional_id: z.string().optional(),
  room_id: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export function ManagePackageTemplatesDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PackageTemplate | null>(null);
  
  const { templates, refetch } = usePackageTemplates();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      description: '',
      total_sessions: 10,
      price: 0,
      duration: 60,
      interval_days: 7,
      professional_id: '_none',
      room_id: '_none',
    },
  });

  const resetForm = () => {
    form.reset({
      name: '',
      description: '',
      total_sessions: 10,
      price: 0,
      duration: 60,
      interval_days: 7,
      professional_id: '_none',
      room_id: '_none',
    });
    setEditingTemplate(null);
  };

  const handleEdit = (template: PackageTemplate) => {
    setEditingTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || '',
      total_sessions: template.total_sessions,
      price: template.price,
      duration: template.duration,
      interval_days: template.interval_days || 7,
      professional_id: template.professional_id || '_none',
      room_id: template.room_id || '_none',
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este modelo?')) return;
    
    const { error } = await supabase
      .from('package_templates')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir modelo');
    } else {
      toast.success('Modelo excluído');
      refetch();
    }
  };

  const onSubmit = async (data: TemplateFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        name: data.name,
        description: data.description || null,
        total_sessions: data.total_sessions,
        price: data.price,
        duration: data.duration,
        interval_days: data.interval_days,
        professional_id: data.professional_id && data.professional_id !== '_none' ? data.professional_id : null,
        room_id: data.room_id && data.room_id !== '_none' ? data.room_id : null,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('package_templates')
          .update(payload)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Modelo atualizado!');
      } else {
        const { error } = await supabase
          .from('package_templates')
          .insert(payload);
        if (error) throw error;
        toast.success('Modelo cadastrado!');
      }
      
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Package className="h-4 w-4" />
          Modelos de Pacote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Modelos de Pacote</DialogTitle>
              <DialogDescription>
                Cadastre modelos pré-definidos para facilitar a criação de pacotes.
              </DialogDescription>
            </div>
            <BulkImportDialog type="package_templates" onImportComplete={refetch} />
          </div>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
          <div className="space-y-4">
            <h3 className="font-medium">
              {editingTemplate ? 'Editar Modelo' : 'Novo Modelo'}
            </h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: 10 Aplicações Laser" {...field} />
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
                        <Textarea placeholder="Detalhes..." className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="total_sessions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sessões *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor (R$) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração (min) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={15} step={15} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interval_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Intervalo (dias) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="professional_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profissional</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Nenhum</SelectItem>
                          {professionals.filter(p => p.is_active).map(prof => (
                            <SelectItem key={prof.id} value={prof.id}>
                              {prof.name}
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
                  name="room_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sala</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Nenhuma</SelectItem>
                          {rooms.filter(r => r.is_active).map(room => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-2">
                  {editingTemplate && (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                  )}
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    {isLoading ? 'Salvando...' : editingTemplate ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* List */}
          <div className="space-y-3">
            <h3 className="font-medium">Modelos Cadastrados</h3>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {templates.map(template => (
                  <Card key={template.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{template.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {template.total_sessions} sessões
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            R$ {Number(template.price).toFixed(2)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {template.duration} min
                          </Badge>
                        </div>
                        {template.professional && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Prof: {template.professional.name}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleEdit(template)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
