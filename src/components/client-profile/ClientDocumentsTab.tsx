import { useState, useRef } from 'react';
import { ClientDocument, DocumentType, Client, DocumentTemplate } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, FileText, ExternalLink, Upload, FileSignature, Eye } from 'lucide-react';
import { useUploadFile } from '@/hooks/useClientProfile';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { ManageTemplatesDialog } from '@/components/services/ManageTemplatesDialog';
import { toast } from 'sonner';

interface ClientDocumentsTabProps {
  documents: ClientDocument[];
  clientId: string;
  client?: Client;
  onAddDocument: (doc: Omit<ClientDocument, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
}

const documentTypeLabels: Record<DocumentType, string> = {
  anamnese: 'Anamnese',
  contract: 'Contrato',
  quote: 'Orçamento',
  photo: 'Foto',
  other: 'Outro',
};

const documentTypeColors: Record<DocumentType, string> = {
  anamnese: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  contract: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  quote: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  photo: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

export function ClientDocumentsTab({ documents, clientId, client, onAddDocument }: ClientDocumentsTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<DocumentType>('anamnese');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [filledContent, setFilledContent] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUploadFile();
  const { templates, refetch: refetchTemplates } = useDocumentTemplates();

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    setLoading(true);
    try {
      let filePath = null;
      let fileUrl = null;

      if (file) {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${clientId}/${timestamp}-${safeName}`;
        const result = await uploadFile(file, path);
        filePath = result.path;
        fileUrl = result.url;
      }

      await onAddDocument({
        client_id: clientId,
        type,
        title: title.trim(),
        description: description.trim() || null,
        file_path: filePath,
        file_url: fileUrl,
      });

      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error adding document:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setTitle(template.title);
      setType('contract');
      
      let content = template.content;
      if (client) {
        content = content.replace(/{nome}/g, client.name || '');
        content = content.replace(/{email}/g, client.email || '');
        content = content.replace(/{telefone}/g, client.phone || '');
        content = content.replace(/{data}/g, format(new Date(), 'dd/MM/yyyy', { locale: ptBR }));
      }
      setFilledContent(content);
    }
  };

  const handleSaveFromTemplate = async () => {
    if (!selectedTemplate) return;

    setLoading(true);
    try {
      await onAddDocument({
        client_id: clientId,
        type: 'contract',
        title: title.trim(),
        description: `Gerado a partir do modelo: ${selectedTemplate.title}`,
        file_path: null,
        file_url: null,
      });

      setOpen(false);
      resetForm();
      toast.success('Documento criado!');
    } catch (error) {
      console.error('Error adding document:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setFile(null);
    setType('anamnese');
    setSelectedTemplate(null);
    setFilledContent('');
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{documents.length} documento(s)</span>
        <div className="flex gap-1.5">
          <ManageTemplatesDialog onTemplateCreated={refetchTemplates}>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <FileSignature className="h-3.5 w-3.5 mr-1" />
              Modelos
            </Button>
          </ManageTemplatesDialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">Adicionar Documento</DialogTitle>
              </DialogHeader>
              
              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-8">
                  <TabsTrigger value="upload" className="text-xs">Upload</TabsTrigger>
                  <TabsTrigger value="template" className="text-xs">Modelo</TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="space-y-3 pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anamnese" className="text-xs">Anamnese</SelectItem>
                        <SelectItem value="contract" className="text-xs">Contrato</SelectItem>
                        <SelectItem value="other" className="text-xs">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Título *</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Ficha de Anamnese"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Observações..."
                      rows={2}
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Arquivo (opcional)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        {file ? file.name : 'Escolher arquivo'}
                      </Button>
                      {file && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFile(null)}>
                          ×
                        </Button>
                      )}
                    </div>
                  </div>

                  <Button onClick={handleSubmit} className="w-full h-8 text-xs" disabled={loading}>
                    {loading ? 'Salvando...' : 'Salvar'}
                  </Button>
                </TabsContent>

                <TabsContent value="template" className="space-y-3 pt-3">
                  {templates.length === 0 ? (
                    <div className="text-center py-6">
                      <FileSignature className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground mb-3">Nenhum modelo</p>
                      <ManageTemplatesDialog onTemplateCreated={refetchTemplates}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Criar Modelo
                        </Button>
                      </ManageTemplatesDialog>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Selecione um Modelo</Label>
                        <Select onValueChange={handleTemplateSelect}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Escolha..." />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map(template => (
                              <SelectItem key={template.id} value={template.id} className="text-xs">
                                {template.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedTemplate && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Título</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Conteúdo</Label>
                              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setPreviewOpen(true)}>
                                <Eye className="h-3 w-3 mr-1" /> Ver
                              </Button>
                            </div>
                            <Textarea
                              value={filledContent}
                              onChange={(e) => setFilledContent(e.target.value)}
                              className="min-h-[100px] font-mono text-xs"
                            />
                          </div>

                          <Button onClick={handleSaveFromTemplate} className="w-full h-8 text-xs" disabled={loading}>
                            {loading ? 'Salvando...' : 'Criar Documento'}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Documents List */}
      <Card>
        <CardContent className="p-3">
          {documents.length === 0 ? (
            <div className="py-6 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum documento</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{doc.title}</span>
                        <Badge className={`${documentTypeColors[doc.type]} text-[10px] px-1.5 py-0`} variant="secondary">
                          {documentTypeLabels[doc.type]}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  {doc.file_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Visualização</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-lg">
            {filledContent}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}