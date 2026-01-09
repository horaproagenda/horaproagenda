import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Info } from 'lucide-react';
import { TemplateFormData } from '@/hooks/useDocumentTemplatesManagement';

const templateSchema = z.object({
  title: z.string().trim().min(2, 'Título obrigatório').max(100),
  description: z.string().trim().max(300).optional(),
  content: z.string().trim().min(10, 'Conteúdo deve ter pelo menos 10 caracteres'),
  variables: z.string().optional(),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof templateSchema>;

interface DocumentTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSave: (data: TemplateFormData) => Promise<void>;
}

const commonVariables = [
  { name: 'nome', description: 'Nome do cliente' },
  { name: 'cpf', description: 'CPF do cliente' },
  { name: 'email', description: 'Email do cliente' },
  { name: 'telefone', description: 'Telefone do cliente' },
  { name: 'data', description: 'Data atual' },
  { name: 'endereco', description: 'Endereço do cliente' },
  { name: 'nascimento', description: 'Data de nascimento' },
  { name: 'profissional', description: 'Nome do profissional' },
  { name: 'servico', description: 'Nome do serviço' },
  { name: 'valor', description: 'Valor do serviço' },
];

export function DocumentTemplateDialog({ 
  open, 
  onOpenChange, 
  template,
  onSave 
}: DocumentTemplateDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      title: '',
      description: '',
      content: '',
      variables: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        title: template.title,
        description: template.description || '',
        content: template.content,
        variables: template.variables?.join(', ') || '',
        is_active: template.is_active,
      });
    } else {
      form.reset({
        title: '',
        description: '',
        content: '',
        variables: '',
        is_active: true,
      });
    }
  }, [template, open]);

  const handleSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const variablesArray = data.variables
        ? data.variables.split(',').map(v => v.trim()).filter(Boolean)
        : [];

      await onSave({
        title: data.title,
        description: data.description || null,
        content: data.content,
        variables: variablesArray,
        is_active: data.is_active,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const insertVariable = (varName: string) => {
    const currentContent = form.getValues('content');
    const currentVariables = form.getValues('variables');
    
    form.setValue('content', currentContent + `{${varName}}`);
    
    const varsArray = currentVariables ? currentVariables.split(',').map(v => v.trim()).filter(Boolean) : [];
    if (!varsArray.includes(varName)) {
      varsArray.push(varName);
      form.setValue('variables', varsArray.join(', '));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{template ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
          <DialogDescription>
            Crie modelos de anamnese, contratos e termos para sua clínica
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Título *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Ex: Anamnese Facial"
                          className="h-9"
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 h-9">
                      <FormLabel className="text-xs m-0">Ativo</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Descrição</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Breve descrição do modelo"
                        className="h-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Variables Helper */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Variáveis disponíveis</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {commonVariables.map(v => (
                    <Button
                      key={v.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => insertVariable(v.name)}
                      title={v.description}
                    >
                      {'{' + v.name + '}'}
                    </Button>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="variables"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Variáveis usadas (separadas por vírgula)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="nome, cpf, data, telefone"
                        className="h-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Conteúdo do Documento *</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field}
                        placeholder="Digite o conteúdo do documento aqui. Use {nome}, {cpf}, {data}, etc. para campos que serão preenchidos automaticamente..."
                        className="min-h-[250px] font-mono text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>

        <div className="flex justify-end gap-3 p-6 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button 
            onClick={form.handleSubmit(handleSubmit)} 
            disabled={isLoading}
          >
            {isLoading ? 'Salvando...' : template ? 'Atualizar' : 'Criar Modelo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
