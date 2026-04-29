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
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  FileText, 
  Download, 
  Upload, 
  FileSignature, 
  Eye, 
  Trash2,
  Link2,
  CheckCircle
} from 'lucide-react';
import { useUploadFile } from '@/hooks/useClientProfile';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { useDocumentFillLinks } from '@/hooks/useDocumentFillLinks';
import { FillDocumentDialog } from '@/components/documentos/FillDocumentDialog';
import { ClientDocumentViewDialog } from '@/components/documentos/ClientDocumentViewDialog';
import { GenerateLinkDialog } from '@/components/documentos/GenerateLinkDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import JSZip from 'jszip';
import { downloadBlob, getFileNameWithExtension, getSafeFileName, getStorageBlob } from '@/lib/storageFileAccess';

interface ClientDocumentsTabProps {
  documents: ClientDocument[];
  clientId: string;
  client?: Client;
  onAddDocument: (doc: Omit<ClientDocument, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onRefresh?: () => void;
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

const getSafeDownloadName = (doc: ClientDocument) => {
  return getFileNameWithExtension(doc.title || 'documento', doc.file_path || doc.file_url);
};

export function ClientDocumentsTab({ documents, clientId, client, onAddDocument, onRefresh }: ClientDocumentsTabProps) {
  const { hasRole } = useAuth();
  const canDeleteDocuments = hasRole('admin');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<DocumentType>('anamnese');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [filledContent, setFilledContent] = useState('');
  const [fillDialogOpen, setFillDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ClientDocument | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTemplate, setLinkTemplate] = useState<{ id: string; title: string } | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
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
      setFillDialogOpen(true);
      setOpen(false);
    }
  };

  const handleViewDocument = (doc: ClientDocument) => {
    setSelectedDocument(doc);
    setViewDialogOpen(true);
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!canDeleteDocuments) {
      toast.error('Apenas administradores podem apagar documentos.');
      return;
    }

    try {
      const { error } = await supabase
        .from('client_documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      toast.success('Documento excluído!');
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Erro ao excluir documento');
    }
  };

  const handleSendByLink = (doc: ClientDocument) => {
    // Find the template for this document
    const templateId = (doc as any).template_id;
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setLinkTemplate({ id: template.id, title: template.title });
        setLinkDialogOpen(true);
        return;
      }
    }
    // Fallback: if no template, try finding by title
    const matchingTemplate = templates.find(t => t.title === doc.title);
    if (matchingTemplate) {
      setLinkTemplate({ id: matchingTemplate.id, title: matchingTemplate.title });
      setLinkDialogOpen(true);
    } else {
      toast.error('Este documento não está vinculado a um modelo. Crie um modelo primeiro.');
    }
  };

  const handleDownloadFile = async (doc: ClientDocument) => {
    try {
      const blob = await getStorageBlob({
        bucket: 'client-documents',
        filePath: doc.file_path,
        fileUrl: doc.file_url,
      });
      downloadBlob(blob, getSafeDownloadName(doc));
    } catch (error) {
      console.error('Error downloading document file:', error);
      toast.error('Sem permissão para baixar este documento.');
    }
  };

  const handleDownloadAllFiles = async () => {
    const downloadableDocs = documents.filter((doc) => doc.file_path || doc.file_url);
    if (downloadableDocs.length === 0) {
      toast.error('Nenhum documento com arquivo para baixar.');
      return;
    }

    setDownloadingAll(true);
    try {
      const zip = new JSZip();
      let addedFiles = 0;

      for (const doc of downloadableDocs) {
        try {
          const blob = await getStorageBlob({
            bucket: 'client-documents',
            filePath: doc.file_path,
            fileUrl: doc.file_url,
          });
          zip.file(`${String(addedFiles + 1).padStart(2, '0')}-${getSafeDownloadName(doc)}`, blob);
          addedFiles += 1;
        } catch (error) {
          console.error('Error adding document to zip:', doc.id, error);
        }
      }

      if (addedFiles === 0) throw new Error('Nenhum documento pôde ser baixado');

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${getSafeFileName(client?.name || 'cliente')}-documentos.zip`);
      toast.success(`${addedFiles} documento(s) baixado(s).`);
    } catch (error) {
      console.error('Error downloading all documents:', error);
      toast.error('Erro ao baixar todos os documentos.');
    } finally {
      setDownloadingAll(false);
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
            
            <Tabs defaultValue="template" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="template" className="text-xs">Usar Modelo</TabsTrigger>
                <TabsTrigger value="upload" className="text-xs">Upload Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="template" className="space-y-3 pt-3">
                {templates.length === 0 ? (
                  <div className="text-center py-6">
                    <FileSignature className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground mb-3">
                      Nenhum modelo disponível
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Acesse "Documentos" no menu para criar modelos
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs">Selecione um Modelo</Label>
                    <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {templates.map(template => (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateSelect(template.id)}
                          className="flex items-start gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left w-full"
                        >
                          <FileSignature className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{template.title}</p>
                            {template.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {template.description}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

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
            </Tabs>
          </DialogContent>
        </Dialog>
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
            <ScrollArea className="h-[300px]">
              <div className="space-y-1.5 pr-2">
                {documents.map((doc) => {
                  const isSigned = !!(doc as any).signed_at;
                  
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors group"
                    >
                      <div 
                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm truncate">{doc.title}</span>
                            <Badge className={`${documentTypeColors[doc.type]} text-[10px] px-1.5 py-0`} variant="secondary">
                              {documentTypeLabels[doc.type]}
                            </Badge>
                            {(doc.content || doc.signed_at) && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                Preenchido
                              </Badge>
                            )}
                            {isSigned && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500 text-green-600">
                                <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                Assinado
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            {isSigned && (doc as any).signed_at && (
                              <span> · Assinado em {format(new Date((doc as any).signed_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {/* Send by Link button */}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleSendByLink(doc)}
                          title="Enviar por Link"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleViewDocument(doc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {(doc.file_path || doc.file_url) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDownloadFile(doc)} title="Baixar documento">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDeleteDocuments && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (window.confirm('Excluir este documento?')) {
                                handleDeleteDocument(doc.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Fill Template Dialog */}
      {selectedTemplate && (
        <FillDocumentDialog
          open={fillDialogOpen}
          onOpenChange={setFillDialogOpen}
          template={selectedTemplate}
          preSelectedClientId={clientId}
          onDocumentSaved={() => {
            setFillDialogOpen(false);
            setSelectedTemplate(null);
            onRefresh?.();
          }}
        />
      )}

      {/* View Document Dialog */}
      <ClientDocumentViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        document={selectedDocument}
        client={client ? { 
          name: client.name, 
          phone: client.phone, 
          email: client.email || undefined 
        } : undefined}
        onDelete={canDeleteDocuments ? (id) => {
          handleDeleteDocument(id);
          setViewDialogOpen(false);
        } : undefined}
      />

      {/* Generate Link Dialog - pre-filled with client */}
      <GenerateLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        template={linkTemplate}
        preSelectedClientId={clientId}
        preSelectedClient={client ? {
          id: client.id,
          name: client.name,
          cpf: client.cpf,
          phone: client.phone,
          birthdate: client.birthdate,
        } : undefined}
      />
    </div>
  );
}
