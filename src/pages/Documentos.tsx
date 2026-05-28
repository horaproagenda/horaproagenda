import { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Copy, 
  Eye, 
  FileSignature, 
  Stethoscope,
  Heart,
  Sparkles,
  FileCheck,
  Filter,
  MoreVertical,
  Download,
  UserPlus,
  Link2
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDocumentTemplatesManagement } from '@/hooks/useDocumentTemplatesManagement';
import { DocumentTemplateDialog } from '@/components/documentos/DocumentTemplateDialog';
import { DocumentPreviewDialog } from '@/components/documentos/DocumentPreviewDialog';
import { PrebuiltTemplatesDialog } from '@/components/documentos/PrebuiltTemplatesDialog';
import { FillDocumentDialog } from '@/components/documentos/FillDocumentDialog';
import { GenerateLinkDialog } from '@/components/documentos/GenerateLinkDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const templateTypeConfig = {
  anamnese: { 
    label: 'Anamnese', 
    icon: Stethoscope, 
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
  },
  contract: { 
    label: 'Contrato', 
    icon: FileSignature, 
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
  },
  consent: { 
    label: 'Termo', 
    icon: FileCheck, 
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
  },
  facial: { 
    label: 'Facial', 
    icon: Sparkles, 
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' 
  },
  corporal: { 
    label: 'Corporal', 
    icon: Heart, 
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' 
  },
};

const Documentos = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [prebuiltOpen, setPrebuiltOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  
  const { 
    templates, 
    isLoading, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate, 
    duplicateTemplate,
    refetch 
  } = useDocumentTemplatesManagement();

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'anamnese') return matchesSearch && template.title.toLowerCase().includes('anamnese');
    if (activeTab === 'contracts') return matchesSearch && (
      template.title.toLowerCase().includes('contrato') || 
      template.title.toLowerCase().includes('termo')
    );
    return matchesSearch;
  });

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setDialogOpen(true);
  };

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const handleFill = (template: any) => {
    setSelectedTemplate(template);
    setFillOpen(true);
  };

  const handleGenerateLink = (template: any) => {
    setSelectedTemplate(template);
    setLinkDialogOpen(true);
  };

  const handleDuplicate = async (template: any) => {
    await duplicateTemplate(template);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      await deleteTemplate(id);
    }
  };

  const handleNew = () => {
    setSelectedTemplate(null);
    setDialogOpen(true);
  };

  const getTemplateType = (title: string): keyof typeof templateTypeConfig => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('facial')) return 'facial';
    if (lowerTitle.includes('corporal')) return 'corporal';
    if (lowerTitle.includes('anamnese')) return 'anamnese';
    if (lowerTitle.includes('contrato')) return 'contract';
    if (lowerTitle.includes('termo') || lowerTitle.includes('consent')) return 'consent';
    return 'anamnese';
  };

  return (
    <AppLayout title="Anamnese e Contratos" subtitle="Modelos de documentos editáveis para clínica estética">
      <PageTransition>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="space-y-4 pr-4">
            {/* Header Actions */}
            <Card className="card-hover">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="flex-1 w-full sm:max-w-sm">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar modelos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1.5"
                      onClick={() => setPrebuiltOpen(true)}
                    >
                      <FileText className="h-4 w-4" />
                      <span className="hidden sm:inline">Modelos Prontos</span>
                      <span className="sm:hidden">Prontos</span>
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handleNew}>
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Novo Modelo</span>
                      <span className="sm:hidden">Novo</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="h-9 bg-muted/50 p-1 gap-1">
                <TabsTrigger value="all" className="text-xs border border-transparent data-[state=active]:bg-slate-500/15 data-[state=active]:text-slate-700 data-[state=active]:border-slate-500/40">Todos</TabsTrigger>
                <TabsTrigger value="anamnese" className="text-xs border border-transparent data-[state=active]:bg-teal-500/15 data-[state=active]:text-teal-700 data-[state=active]:border-teal-500/40">Anamneses</TabsTrigger>
                <TabsTrigger value="contracts" className="text-xs border border-transparent data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-700 data-[state=active]:border-amber-500/40">Contratos/Termos</TabsTrigger>
              </TabsList>


              <TabsContent value={activeTab} className="mt-4">
                {isLoading ? (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-4 h-40" />
                      </Card>
                    ))}
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">
                        {searchTerm ? 'Nenhum modelo encontrado' : 'Nenhum modelo cadastrado'}
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button variant="outline" size="sm" onClick={() => setPrebuiltOpen(true)}>
                          <FileText className="h-4 w-4 mr-1" />
                          Usar Modelo Pronto
                        </Button>
                        <Button size="sm" onClick={handleNew}>
                          <Plus className="h-4 w-4 mr-1" />
                          Criar do Zero
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTemplates.map(template => {
                      const type = getTemplateType(template.title);
                      const config = templateTypeConfig[type];
                      const Icon = config.icon;
                      
                      return (
                        <Card 
                          key={template.id} 
                          className="card-hover group cursor-pointer transition-all"
                          onClick={() => handlePreview(template)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`rounded-lg p-1.5 ${config.color}`}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <Badge variant="secondary" className={`${config.color} text-[10px]`}>
                                  {config.label}
                                </Badge>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleFill(template); }}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Preencher p/ Cliente
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleGenerateLink(template); }}>
                                    <Link2 className="h-4 w-4 mr-2" />
                                    Enviar Link p/ Cliente
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(template); }}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Visualizar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(template); }}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <CardTitle className="text-sm font-medium line-clamp-1 mt-2">
                              {template.title}
                            </CardTitle>
                            {template.description && (
                              <CardDescription className="text-xs line-clamp-2">
                                {template.description}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-1 mb-2">
                              {template.variables?.slice(0, 3).map((v: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px] px-1.5">
                                  {'{' + v + '}'}
                                </Badge>
                              ))}
                              {template.variables?.length > 3 && (
                                <Badge variant="outline" className="text-[10px] px-1.5">
                                  +{template.variables.length - 3}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-muted-foreground">
                                Atualizado em {format(new Date(template.updated_at), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                                  title="Editar"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Info Card */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <FileSignature className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium mb-1">Assinatura Digital</h4>
                    <p className="text-xs text-muted-foreground">
                      Os documentos podem ser assinados digitalmente através do{' '}
                      <a 
                        href="https://assinador.iti.br/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Assinador Gov.br
                      </a>
                      {' '}ou exportados em PDF para assinatura em outros serviços.
                      Use as variáveis como {'{nome}'}, {'{cpf}'}, {'{data}'} para personalizar automaticamente.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        {/* Dialogs */}
        <DocumentTemplateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          template={selectedTemplate}
          onSave={async (data) => {
            try {
              if (selectedTemplate) {
                await updateTemplate(selectedTemplate.id, data);
              } else {
                await createTemplate(data);
              }
              setDialogOpen(false);
              setSelectedTemplate(null);
            } catch (err) {
              // Error toast is already shown by the mutation's onError
              console.error('Error saving template:', err);
            }
          }}
        />

        <DocumentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          template={selectedTemplate}
          onEdit={() => {
            setPreviewOpen(false);
            setDialogOpen(true);
          }}
        />

        <PrebuiltTemplatesDialog
          open={prebuiltOpen}
          onOpenChange={setPrebuiltOpen}
          onSelectTemplate={async (template) => {
            try {
              await createTemplate(template);
              setPrebuiltOpen(false);
            } catch (err) {
              console.error('Error using prebuilt template:', err);
            }
          }}
        />

        <FillDocumentDialog
          open={fillOpen}
          onOpenChange={setFillOpen}
          template={selectedTemplate}
          onDocumentSaved={() => {
            setFillOpen(false);
            toast.success('Documento vinculado ao cliente!');
          }}
        />

        <GenerateLinkDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          template={selectedTemplate}
        />
      </PageTransition>
    </AppLayout>
  );
};

export default Documentos;
