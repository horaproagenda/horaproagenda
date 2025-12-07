import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileText, Plus, Trash2, Edit2 } from 'lucide-react';
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
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';

const templateSchema = z.object({
  title: z.string().trim().min(2, 'Título deve ter pelo menos 2 caracteres').max(100, 'Título muito longo'),
  description: z.string().trim().max(200, 'Descrição muito longa').optional(),
  content: z.string().trim().min(10, 'Conteúdo deve ter pelo menos 10 caracteres'),
  variables: z.string().optional(),
  is_active: z.boolean(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

interface ManageTemplatesDialogProps {
  children?: React.ReactNode;
  onTemplateCreated?: () => void;
}

export function ManageTemplatesDialog({ children, onTemplateCreated }: ManageTemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { templates, refetch } = useDocumentTemplates();

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      title: '',
      description: '',
      content: '',
      variables: '',
      is_active: true,
    },
  });

  const onSubmit = async (data: TemplateFormData) => {
    setIsLoading(true);
    try {
      const variablesArray = data.variables
        ? data.variables.split(',').map(v => v.trim()).filter(Boolean)
        : [];

      if (editingId) {
        const { error } = await supabase
          .from('document_templates')
          .update({
            title: data.title,
            description: data.description || null,
            content: data.content,
            variables: variablesArray,
            is_active: data.is_active,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Modelo atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('document_templates')
          .insert({
            title: data.title,
            description: data.description || null,
            content: data.content,
            variables: variablesArray,
            is_active: data.is_active,
          });
        if (error) throw error;
        toast.success('Modelo cadastrado com sucesso!');
      }

      form.reset();
      setShowForm(false);
      setEditingId(null);
      refetch();
      onTemplateCreated?.();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (template: any) => {
    setEditingId(template.id);
    form.reset({
      title: template.title,
      description: template.description || '',
      content: template.content,
      variables: template.variables?.join(', ') || '',
      is_active: template.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('document_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Modelo removido!');
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
            <FileText className="h-4 w-4" />
            Modelos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modelos de Documentos</DialogTitle>
          <DialogDescription>
            Crie modelos editáveis com variáveis como {'{nome}'}, {'{data}'}, etc.
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <Button onClick={() => setShowForm(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Novo Modelo
            </Button>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {templates.map(template => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{template.title}</span>
                    </div>
                    {template.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {template.description}
                      </p>
                    )}
                    {template.variables && template.variables.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {template.variables.map((v: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {'{' + v + '}'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum modelo cadastrado
                </p>
              )}
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Termo de Consentimento" {...field} />
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
                      <Input placeholder="Breve descrição do modelo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="variables"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variáveis (separadas por vírgula)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: nome, data, cpf, endereco" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Use as variáveis no conteúdo com {'{nome_da_variavel}'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conteúdo do Documento *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Digite o conteúdo do documento aqui. Use {nome}, {data}, etc. para campos variáveis..."
                        className="min-h-[200px] font-mono text-sm"
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
                    <FormLabel>Modelo Ativo</FormLabel>
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