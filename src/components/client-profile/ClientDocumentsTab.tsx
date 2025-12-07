import { useState, useRef } from 'react';
import { ClientDocument, DocumentType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, FileText, Download, ExternalLink, Upload } from 'lucide-react';
import { useUploadFile } from '@/hooks/useClientProfile';
import { toast } from 'sonner';

interface ClientDocumentsTabProps {
  documents: ClientDocument[];
  clientId: string;
  onAddDocument: (doc: Omit<ClientDocument, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
}

const documentTypeLabels: Record<DocumentType, string> = {
  anamnese: 'Ficha de Anamnese',
  contract: 'Contrato',
  quote: 'Orçamento',
  photo: 'Foto',
  other: 'Outro',
};

const documentTypeColors: Record<DocumentType, string> = {
  anamnese: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  contract: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  quote: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  photo: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export function ClientDocumentsTab({ documents, clientId, onAddDocument }: ClientDocumentsTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<DocumentType>('anamnese');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUploadFile();

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
      setTitle('');
      setDescription('');
      setFile(null);
      setType('anamnese');
    } catch (error) {
      console.error('Error adding document:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Documentos</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Documento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Tipo de Documento</Label>
                <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anamnese">Ficha de Anamnese</SelectItem>
                    <SelectItem value="contract">Contrato</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Ficha de Anamnese - Janeiro 2024"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Observações sobre o documento..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Arquivo (opcional)</Label>
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
                    className="flex-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {file ? file.name : 'Escolher arquivo'}
                  </Button>
                  {file && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Documento'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum documento cadastrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground">{doc.title}</h4>
                      <Badge className={documentTypeColors[doc.type]} variant="secondary">
                        {documentTypeLabels[doc.type]}
                      </Badge>
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground">{doc.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Adicionado em {format(new Date(doc.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                {doc.file_url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
