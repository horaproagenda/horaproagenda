import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Info, CheckSquare, Type, HelpCircle, User, Building2, Calendar } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TemplateFormData } from '@/hooks/useDocumentTemplatesManagement';
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor';

const templateSchema = z.object({
  title: z.string().trim().min(2, 'Título obrigatório').max(100),
  description: z.string().trim().max(300).optional(),
  content: z.string().trim().min(10, 'Conteúdo deve ter pelo menos 10 caracteres'),
  variables: z.string().optional(),
  is_active: z.boolean(),
  category: z.enum(['anamnese', 'contract', 'consent']),
});

type FormData = z.infer<typeof templateSchema>;

interface DocumentTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSave: (data: TemplateFormData) => Promise<void>;
}

type VarItem = { name: string; description: string };

// Dados do CLIENTE — preenchidos automaticamente com os dados do cliente do atendimento
const clientVariables: VarItem[] = [
  { name: 'nome_cliente', description: 'Nome do cliente' },
  { name: 'cpf', description: 'CPF do cliente' },
  { name: 'telefone_cliente', description: 'Telefone do cliente' },
  { name: 'email_cliente', description: 'E-mail do cliente' },
  { name: 'endereco_cliente', description: 'Endereço completo do cliente (rua, número, bairro, cidade)' },
  { name: 'cidade', description: 'Cidade do cliente' },
  { name: 'nascimento', description: 'Data de nascimento do cliente' },
  { name: 'idade', description: 'Idade calculada do cliente' },
];

// Dados da CLÍNICA / ESTABELECIMENTO — vêm das configurações do seu negócio
const clinicVariables: VarItem[] = [
  { name: 'nome_clinica', description: 'Nome da clínica/estabelecimento' },
  { name: 'telefone_clinica', description: 'Telefone da clínica' },
  { name: 'email_clinica', description: 'E-mail da clínica' },
  { name: 'endereco_clinica', description: 'Endereço da clínica' },
  { name: 'cnpj_clinica', description: 'CNPJ da clínica' },
];

// Dados de CONTEXTO / DATA — gerados no momento do preenchimento
const contextVariables: VarItem[] = [
  { name: 'data', description: 'Data atual no formato dd/mm/aaaa (sempre o dia em que o documento é preenchido)' },
  { name: 'data_extenso', description: 'Data atual por extenso, ex.: "28 de maio de 2026". É sempre a data do dia em que o documento é preenchido — não é uma data digitada manualmente.' },
  { name: 'hora', description: 'Hora atual (HH:mm) no momento do preenchimento' },
  { name: 'profissional', description: 'Nome do profissional do atendimento' },
  { name: 'servico', description: 'Serviço ou pacote selecionado' },
  { name: 'valor', description: 'Valor do serviço/pacote' },
];

const interactivePatterns = [
  { pattern: '( )', description: 'Caixa de seleção — vira checkbox clicável no preenchimento online', icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { pattern: '( ) Sim ( ) Não', description: 'Pergunta Sim/Não - o cliente marca com X', icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { pattern: '[TEXTO_LIVRE]', description: 'Caixa de texto - espaço para o cliente escrever', icon: <Type className="h-3.5 w-3.5" /> },
];

function HelpHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground hover:text-foreground transition-colors" aria-label="Ajuda">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function VariableGroup({
  title,
  hint,
  icon,
  items,
  onInsert,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  items: VarItem[];
  onInsert: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium">{title}</span>
        <HelpHint text={hint} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(v => (
          <Tooltip key={v.name}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => onInsert(v.name)}
              >
                {'{' + v.name + '}'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {v.description}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export function DocumentTemplateDialog({ open, onOpenChange, template, onSave }: DocumentTemplateDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const editorRef = useRef<RichTextEditorHandle | null>(null);

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
      return;
    }

    form.reset({
      title: '',
      description: '',
      content: '',
      variables: '',
      is_active: true,
    });
  }, [template, open, form]);

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

  const insertIntoContent = (value: string, autoRegisterVariable?: string) => {
    editorRef.current?.focus();
    editorRef.current?.insertText(value);

    if (autoRegisterVariable) {
      const currentVariables = form.getValues('variables');
      const varsArray = currentVariables ? currentVariables.split(',').map(v => v.trim()).filter(Boolean) : [];
      if (!varsArray.includes(autoRegisterVariable)) {
        varsArray.push(autoRegisterVariable);
        form.setValue('variables', varsArray.join(', '), { shouldDirty: true });
      }
    }
  };

  const insertVariable = (varName: string) => insertIntoContent(`{${varName}}`, varName);
  const insertPattern = (pattern: string) => insertIntoContent(pattern);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-base">{template ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
          <DialogDescription className="text-sm">
            Crie modelos de anamnese, contratos e termos para sua clínica
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Título *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Anamnese Facial" className="h-9" />
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
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                        <Input {...field} placeholder="Breve descrição do modelo" className="h-9" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <TooltipProvider delayDuration={150}>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">Variáveis disponíveis</span>
                      <HelpHint text="Clique em uma variável para inseri-la na posição atual do cursor do documento. Cada variável vira um marcador (ex.: {nome_cliente}) que será substituído pelos dados reais no momento em que o documento for preenchido ou impresso. Passe o mouse sobre cada uma para ver o que ela representa." />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Separamos para deixar claro o que é do <strong>cliente</strong> e o que é da <strong>clínica</strong>.
                    </p>

                    <VariableGroup
                      title="Dados do cliente"
                      icon={<User className="h-3.5 w-3.5 text-primary" />}
                      hint="Preenchidos automaticamente com os dados do cliente do atendimento (nome, telefone, e-mail, endereço, etc.)."
                      items={clientVariables}
                      onInsert={insertVariable}
                    />

                    <VariableGroup
                      title="Dados da clínica / estabelecimento"
                      icon={<Building2 className="h-3.5 w-3.5 text-primary" />}
                      hint="Vêm das configurações do seu negócio (Configurações → Estabelecimento). Use para identificar a clínica no documento."
                      items={clinicVariables}
                      onInsert={insertVariable}
                    />

                    <VariableGroup
                      title="Data e contexto"
                      icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
                      hint='"Data por extenso" é SEMPRE a data atual do dia em que o documento for preenchido — não é uma data manual. Vale o mesmo para {data} e {hora}.'
                      items={contextVariables}
                      onInsert={insertVariable}
                    />
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">Campos interativos</span>
                      <HelpHint text="Padrões que viram elementos clicáveis ou editáveis quando o cliente preenche o documento online." />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Os padrões abaixo são inseridos exatamente na posição do cursor no documento.
                    </p>
                    <div className="space-y-1.5">
                      {interactivePatterns.map(p => (
                        <Button
                          key={p.pattern}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto py-1.5 px-3 text-left w-full justify-start gap-2"
                          onClick={() => insertPattern(p.pattern)}
                        >
                          {p.icon}
                          <div>
                            <span className="font-mono text-[10px]">{p.pattern}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">— {p.description}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="variables"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs flex items-center gap-1.5">
                          Variáveis usadas neste modelo (separadas por vírgula)
                          <HelpHint text="Este campo é um RESUMO/ETIQUETA das variáveis que o seu modelo utiliza — serve para organização e relatórios. Ele é preenchido automaticamente toda vez que você clica em uma variável acima. Você só precisa editar manualmente se quiser remover alguma. As variáveis que efetivamente aparecem no documento são as que estão escritas dentro de chaves no conteúdo, ex.: {nome_cliente}." />
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="nome_cliente, cpf, data, telefone_cliente" className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TooltipProvider>


                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Conteúdo do Documento *</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          ref={editorRef}
                          value={field.value || ''}
                          onChange={(html) =>
                            form.setValue('content', html, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            })
                          }
                          placeholder={`Digite o conteúdo do documento aqui.\n\nUse {nome}, {cpf}, {data} para campos automáticos.\nUse ( ) para caixas de seleção clicáveis.\nUse ( ) Sim ( ) Não para perguntas.\nUse [TEXTO_LIVRE] para caixas de escrita.`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </form>
            </Form>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 p-4 border-t bg-muted/10 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={form.handleSubmit(handleSubmit)} disabled={isLoading}>
            {isLoading ? 'Salvando...' : template ? 'Atualizar' : 'Criar Modelo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
