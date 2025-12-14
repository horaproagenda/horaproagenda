import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useAuth } from '@/contexts/AuthContext';

interface ParsedService {
  name: string;
  category: string;
  price: number;
  duration: number;
  description?: string;
  return_days?: number;
}

interface ParsedClient {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthdate?: string;
  notes?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface BulkImportDialogProps {
  type: 'services' | 'clients';
  onImportComplete?: () => void;
}

export function BulkImportDialog({ type, onImportComplete }: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedService[] | ParsedClient[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { professionalId } = useCurrentProfessional();
  const { hasRole } = useAuth();
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');

  const parseCSVContent = (content: string): ParsedService[] | ParsedClient[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('O arquivo deve ter pelo menos um cabeçalho e uma linha de dados');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      
      if (type === 'services') {
        if (!row.nome && !row.name) continue;
        data.push({
          name: row.nome || row.name || '',
          category: row.categoria || row.category || 'Outros',
          price: parseFloat(row.preco || row.price || '0') || 0,
          duration: parseInt(row.duracao || row.duration || '60') || 60,
          description: row.descricao || row.description || undefined,
          return_days: row.retorno || row.return_days ? parseInt(row.retorno || row.return_days) : undefined,
        } as ParsedService);
      } else {
        if (!row.nome && !row.name) continue;
        data.push({
          name: row.nome || row.name || '',
          phone: row.telefone || row.phone || '',
          email: row.email || undefined,
          cpf: row.cpf || undefined,
          birthdate: row.nascimento || row.birthdate || undefined,
          notes: row.observacoes || row.notes || undefined,
        } as ParsedClient);
      }
    }

    return data;
  };

  const parseTextContent = (content: string): ParsedService[] | ParsedClient[] => {
    // Try to detect if it's a structured table
    const lines = content.trim().split('\n').filter(l => l.trim());
    const data: any[] = [];

    // Check if it looks like a table with tabs or multiple spaces
    const isTable = lines.some(line => line.includes('\t') || /\s{2,}/.test(line));

    if (isTable) {
      // Parse as table
      const delimiter = lines[0].includes('\t') ? '\t' : /\s{2,}/;
      const headerLine = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim());
        const row: any = {};
        
        headerLine.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        if (type === 'services') {
          if (!row.nome && !row.name) continue;
          data.push({
            name: row.nome || row.name || '',
            category: row.categoria || row.category || 'Outros',
            price: parseFloat(row.preco || row.price || '0') || 0,
            duration: parseInt(row.duracao || row.duration || '60') || 60,
            description: row.descricao || row.description || undefined,
          } as ParsedService);
        } else {
          if (!row.nome && !row.name) continue;
          data.push({
            name: row.nome || row.name || '',
            phone: row.telefone || row.phone || '',
            email: row.email || undefined,
          } as ParsedClient);
        }
      }
    } else {
      // Parse as simple list (one item per line)
      for (const line of lines) {
        if (type === 'services') {
          data.push({
            name: line.trim(),
            category: 'Outros',
            price: 0,
            duration: 60,
          } as ParsedService);
        } else {
          data.push({
            name: line.trim(),
            phone: '',
          } as ParsedClient);
        }
      }
    }

    return data;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setParsedData([]);
    setResult(null);

    const fileName = file.name.toLowerCase();
    
    try {
      if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        const content = await file.text();
        const parsed = fileName.endsWith('.csv') 
          ? parseCSVContent(content) 
          : parseTextContent(content);
        setParsedData(parsed);
      } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') || fileName.endsWith('.pdf')) {
        setParseError('Para arquivos Word ou PDF, por favor copie o conteúdo da tabela e salve como CSV ou TXT. Formato esperado:\n\nPara serviços: Nome,Categoria,Preço,Duração\nPara clientes: Nome,Telefone,Email,CPF');
      } else {
        setParseError('Formato de arquivo não suportado. Use CSV ou TXT.');
      }
    } catch (error: any) {
      setParseError(error.message || 'Erro ao processar arquivo');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setIsLoading(true);
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    try {
      if (type === 'services') {
        for (const service of parsedData as ParsedService[]) {
          try {
            const { error } = await supabase.from('services').insert({
              name: service.name,
              category: service.category,
              price: service.price,
              duration: service.duration,
              description: service.description || null,
              return_days: service.return_days || null,
              is_active: true,
              professional_id: isAdminOrReceptionist ? null : professionalId,
            });

            if (error) {
              errors.push(`${service.name}: ${error.message}`);
              failed++;
            } else {
              success++;
            }
          } catch (err: any) {
            errors.push(`${service.name}: ${err.message}`);
            failed++;
          }
        }
      } else {
        for (const client of parsedData as ParsedClient[]) {
          try {
            const { error } = await supabase.from('clients').insert({
              name: client.name,
              phone: client.phone || '00000000000',
              email: client.email || null,
              cpf: client.cpf || null,
              birthdate: client.birthdate || null,
              notes: client.notes || null,
              is_active: true,
              assigned_professional_id: isAdminOrReceptionist ? null : professionalId,
            });

            if (error) {
              errors.push(`${client.name}: ${error.message}`);
              failed++;
            } else {
              success++;
            }
          } catch (err: any) {
            errors.push(`${client.name}: ${err.message}`);
            failed++;
          }
        }
      }

      setResult({ success, failed, errors });
      
      if (success > 0) {
        toast.success(`${success} ${type === 'services' ? 'serviços' : 'clientes'} importados com sucesso!`);
        onImportComplete?.();
      }
    } catch (error: any) {
      toast.error('Erro na importação: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetDialog = () => {
    setParsedData([]);
    setResult(null);
    setParseError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar {type === 'services' ? 'Serviços' : 'Clientes'} em Massa</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV ou TXT com os dados para importar.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* File format info */}
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Formato esperado (CSV):</strong>
                <br />
                {type === 'services' ? (
                  <code className="text-xs">Nome,Categoria,Preço,Duração,Descrição,Retorno</code>
                ) : (
                  <code className="text-xs">Nome,Telefone,Email,CPF,Nascimento,Observações</code>
                )}
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  A primeira linha deve conter os cabeçalhos. Colunas aceitas em português ou inglês.
                </span>
              </AlertDescription>
            </Alert>

            {/* File upload */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.doc,.docx,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Selecionar Arquivo
              </Button>
              <span className="text-sm text-muted-foreground">
                CSV, TXT, Word ou PDF
              </span>
            </div>

            {/* Parse error */}
            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="whitespace-pre-wrap">{parseError}</AlertDescription>
              </Alert>
            )}

            {/* Parsed data preview */}
            {parsedData.length > 0 && !result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Prévia ({parsedData.length} itens)</h4>
                  <Badge variant="secondary">{parsedData.length} para importar</Badge>
                </div>
                
                <div className="border rounded-lg max-h-[200px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {type === 'services' ? (
                          <>
                            <th className="p-2 text-left">Nome</th>
                            <th className="p-2 text-left">Categoria</th>
                            <th className="p-2 text-right">Preço</th>
                            <th className="p-2 text-right">Duração</th>
                          </>
                        ) : (
                          <>
                            <th className="p-2 text-left">Nome</th>
                            <th className="p-2 text-left">Telefone</th>
                            <th className="p-2 text-left">Email</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(parsedData as any[]).slice(0, 10).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          {type === 'services' ? (
                            <>
                              <td className="p-2">{(item as ParsedService).name}</td>
                              <td className="p-2">{(item as ParsedService).category}</td>
                              <td className="p-2 text-right">R$ {(item as ParsedService).price.toFixed(2)}</td>
                              <td className="p-2 text-right">{(item as ParsedService).duration} min</td>
                            </>
                          ) : (
                            <>
                              <td className="p-2">{(item as ParsedClient).name}</td>
                              <td className="p-2">{(item as ParsedClient).phone}</td>
                              <td className="p-2">{(item as ParsedClient).email || '-'}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.length > 10 && (
                    <p className="p-2 text-xs text-muted-foreground text-center border-t">
                      ...e mais {parsedData.length - 10} itens
                    </p>
                  )}
                </div>

                <Button onClick={handleImport} disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar {parsedData.length} {type === 'services' ? 'serviços' : 'clientes'}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Import result */}
            {result && (
              <div className="space-y-3">
                <Alert variant={result.failed === 0 ? 'default' : 'destructive'}>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{result.success}</strong> importados com sucesso
                    {result.failed > 0 && (
                      <>, <strong>{result.failed}</strong> falharam</>
                    )}
                  </AlertDescription>
                </Alert>

                {result.errors.length > 0 && (
                  <div className="border rounded-lg p-3 max-h-[150px] overflow-auto">
                    <p className="font-medium text-sm mb-2">Erros:</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      {result.errors.map((err, idx) => (
                        <li key={idx}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button variant="outline" onClick={resetDialog} className="w-full">
                  Importar mais
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}