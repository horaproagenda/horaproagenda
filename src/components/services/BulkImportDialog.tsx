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
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useEquipment } from '@/hooks/useEquipment';
import { parseCsv, downloadCsvTemplate } from '@/lib/exportUtils';
import { mapHeaders } from '@/lib/importMapping';
import { parseBrazilianCurrency } from '@/lib/utils';

interface ParsedService {
  name: string;
  category: string;
  price: number;
  duration: number;
  description?: string;
  return_days?: number;
  professional_id?: string | null;
  room_id?: string | null;
  equipment?: string[] | null;
  is_active?: boolean;
}

interface ParsedClient {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthdate?: string;
  notes?: string;
}

interface ParsedPackageTemplate {
  name: string;
  description?: string;
  total_sessions: number;
  price: number;
  duration: number;
  interval_days: number;
  return_days?: number;
  professional_id?: string | null;
  room_id?: string | null;
  equipment?: string[] | null;
  is_active?: boolean;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface BulkImportDialogProps {
  type: 'services' | 'clients' | 'package_templates';
  onImportComplete?: () => void;
  trigger?: React.ReactNode;
}

const normalizeName = (v: string) =>
  (v ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const parseStatusActive = (v: string): boolean => {
  const s = normalizeName(v);
  if (!s) return true;
  return !['inativo', 'inactive', 'inativa', 'nao', 'no', 'false', '0', 'desativado'].includes(s);
};

export function BulkImportDialog({ type, onImportComplete, trigger }: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedService[] | ParsedClient[] | ParsedPackageTemplate[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { professionalId } = useCurrentProfessional();
  const { hasRole } = useAuth();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { equipment } = useEquipment();
  const isAdminOrReceptionist = hasRole('admin') || hasRole('receptionist');

  const professionalIdByName = new Map(
    (professionals || []).map((p: any) => [normalizeName(p.name), p.id] as const),
  );
  const roomIdByName = new Map(
    (rooms || []).map((r: any) => [normalizeName(r.name), r.id] as const),
  );
  const equipmentIdByName = new Map(
    (equipment || []).map((e: any) => [normalizeName(e.name), e.id] as const),
  );

  const resolveProfessional = (raw: string): string | null => {
    if (!raw) return null;
    return professionalIdByName.get(normalizeName(raw)) || null;
  };
  const resolveRoom = (raw: string): string | null => {
    if (!raw) return null;
    return roomIdByName.get(normalizeName(raw)) || null;
  };
  const resolveEquipment = (raw: string): string[] | null => {
    if (!raw) return null;
    const ids = raw
      .split(/[;,|]/)
      .map((n) => equipmentIdByName.get(normalizeName(n)))
      .filter((v): v is string => Boolean(v));
    return ids.length ? ids : null;
  };


  const parseBirthdate = (dateStr: string): string | undefined => {
    if (!dateStr) return undefined;
    const cleanDate = dateStr.toString().trim();
    
    // Already in ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return cleanDate;
    
    // DD/MM/YYYY or DD-MM-YYYY
    const brMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Excel serial date
    const serialNumber = parseFloat(cleanDate);
    if (!isNaN(serialNumber) && serialNumber > 10000 && serialNumber < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + serialNumber * 86400000);
      return date.toISOString().split('T')[0];
    }

    return undefined;
  };

  const normalizePhone = (phone: string): string => {
    if (!phone) return '';
    return phone.toString().replace(/\D/g, '');
  };

  const parseCSVContent = (content: string): ParsedService[] | ParsedClient[] | ParsedPackageTemplate[] => {
    // Parser CSV robusto: respeita aspas, separadores embutidos e quebras
    // de linha. Detecta automaticamente `;`, `,` ou `\t`.
    const rows: string[][] = parseCsv(content);
    if (rows.length < 2) {
      throw new Error('O arquivo deve ter pelo menos um cabeçalho e uma linha de dados.');
    }

    // Mapeamento de colunas com validação clara de obrigatórias
    const mapping = mapHeaders(type, rows[0]);
    if (mapping.missingRequired.length > 0) {
      throw new Error(
        `Coluna${mapping.missingRequired.length > 1 ? 's' : ''} obrigatória${
          mapping.missingRequired.length > 1 ? 's' : ''
        } ausente${mapping.missingRequired.length > 1 ? 's' : ''}: ${mapping.missingRequired.join(', ')}. ` +
          'Verifique o cabeçalho do arquivo ou baixe o modelo CSV.',
      );
    }

    const idx = mapping.indices;
    const cell = (row: string[], i: number) => (i >= 0 && i < row.length ? (row[i] ?? '').trim() : '');
    const data: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
      if (!values || values.every((v) => !v || !v.trim())) continue;

      if (type === 'services') {
        const name = cell(values, idx.name);
        if (!name) continue;
        const retorno = cell(values, idx.return_days);
        data.push({
          name,
          category: cell(values, idx.category) || 'Outros',
          price: parseBrazilianCurrency(cell(values, idx.price)),
          duration: parseInt(cell(values, idx.duration) || '60') || 60,
          description: cell(values, idx.description) || undefined,
          return_days: retorno ? parseInt(retorno) || undefined : undefined,
          professional_id: resolveProfessional(cell(values, idx.professional)),
          room_id: resolveRoom(cell(values, idx.room)),
          equipment: resolveEquipment(cell(values, idx.equipment)),
          is_active: parseStatusActive(cell(values, idx.status)),
        } as ParsedService);
      } else if (type === 'clients') {
        const name = cell(values, idx.name);
        if (!name) continue;
        data.push({
          name,
          phone: normalizePhone(cell(values, idx.phone)),
          email: cell(values, idx.email) || undefined,
          cpf: cell(values, idx.cpf) ? cell(values, idx.cpf).replace(/\D/g, '') : undefined,
          birthdate: parseBirthdate(cell(values, idx.birthdate)),
          notes: cell(values, idx.notes) || undefined,
        } as ParsedClient);
      } else if (type === 'package_templates') {
        const name = cell(values, idx.name);
        if (!name) continue;
        const retorno = cell(values, idx.return_days);
        data.push({
          name,
          description: cell(values, idx.description) || undefined,
          total_sessions: parseInt(cell(values, idx.total_sessions) || '10') || 10,
          price: parseBrazilianCurrency(cell(values, idx.price)),
          duration: parseInt(cell(values, idx.duration) || '60') || 60,
          interval_days: parseInt(cell(values, idx.interval_days) || '7') || 7,
          return_days: retorno ? parseInt(retorno) || undefined : undefined,
          professional_id: resolveProfessional(cell(values, idx.professional)),
          room_id: resolveRoom(cell(values, idx.room)),
          equipment: resolveEquipment(cell(values, idx.equipment)),
          is_active: parseStatusActive(cell(values, idx.status)),
        } as ParsedPackageTemplate);
      }
    }

    if (data.length === 0) {
      throw new Error('Nenhuma linha válida encontrada. Verifique se o arquivo tem dados além do cabeçalho.');
    }

    return data;
  };


  const parseTextContent = (content: string): ParsedService[] | ParsedClient[] | ParsedPackageTemplate[] => {
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
            price: parseBrazilianCurrency(row.preco || row.price),
            duration: parseInt(row.duracao || row.duration || '60') || 60,
            description: row.descricao || row.description || undefined,
          } as ParsedService);
        } else if (type === 'clients') {
          if (!row.nome && !row.name) continue;
          data.push({
            name: row.nome || row.name || '',
            phone: row.telefone || row.phone || '',
            email: row.email || undefined,
          } as ParsedClient);
        } else if (type === 'package_templates') {
          if (!row.nome && !row.name) continue;
          data.push({
            name: row.nome || row.name || '',
            description: row.descricao || row.description || undefined,
            total_sessions: parseInt(row.sessoes || row.total_sessions || '10') || 10,
            price: parseBrazilianCurrency(row.preco || row.price),
            duration: parseInt(row.duracao || row.duration || '60') || 60,
            interval_days: parseInt(row.intervalo || row.interval_days || '7') || 7,
          } as ParsedPackageTemplate);
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
        } else if (type === 'clients') {
          data.push({
            name: line.trim(),
            phone: '',
          } as ParsedClient);
        } else if (type === 'package_templates') {
          data.push({
            name: line.trim(),
            total_sessions: 10,
            price: 0,
            duration: 60,
            interval_days: 7,
          } as ParsedPackageTemplate);
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
              is_active: service.is_active ?? true,
              professional_id: service.professional_id
                ?? (isAdminOrReceptionist ? null : professionalId),
              room_id: service.room_id ?? null,
              equipment: service.equipment ?? null,
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
      } else if (type === 'clients') {
        for (const client of parsedData as ParsedClient[]) {
          try {
            // Validate phone - at least 10 digits
            const phone = client.phone?.replace(/\D/g, '') || '';
            if (phone.length < 10) {
              errors.push(`${client.name}: Telefone inválido (mín. 10 dígitos)`);
              failed++;
              continue;
            }

            const { error } = await supabase.from('clients').insert({
              name: client.name,
              phone: phone,
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
      } else if (type === 'package_templates') {
        for (const template of parsedData as ParsedPackageTemplate[]) {
          try {
            const { error } = await supabase.from('package_templates').insert({
              name: template.name,
              description: template.description || null,
              total_sessions: template.total_sessions,
              price: template.price,
              duration: template.duration,
              interval_days: template.interval_days,
              return_days: template.return_days ?? null,
              is_active: template.is_active ?? true,
              professional_id: template.professional_id ?? null,
              room_id: template.room_id ?? null,
              equipment: template.equipment ?? null,
            } as any);

            if (error) {
              errors.push(`${template.name}: ${error.message}`);
              failed++;
            } else {
              success++;
            }
          } catch (err: any) {
            errors.push(`${template.name}: ${err.message}`);
            failed++;
          }
        }
      }

      setResult({ success, failed, errors });
      
      if (success > 0) {
        const typeLabel = type === 'services' ? 'serviços' : type === 'clients' ? 'clientes' : 'modelos de pacote';
        toast.success(`${success} ${typeLabel} importados com sucesso!`);
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
        {trigger ?? (
          <Button variant="outline" size="icon" className="h-8 w-8" title="Importar">
            <Upload className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Importar {type === 'services' ? 'Serviços' : type === 'clients' ? 'Clientes' : 'Modelos de Pacote'} em Massa</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV ou TXT com os dados para importar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* File format info */}
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Formato esperado (CSV):</strong>
                <br />
                {type === 'services' ? (
                  <code className="text-xs">Nome,Categoria,Preço,Duração,Descrição,Retorno,Profissional,Sala,Equipamento,Status</code>
                ) : type === 'clients' ? (
                  <code className="text-xs">Nome,Telefone,Email,CPF,Nascimento,Observações</code>
                ) : (
                  <code className="text-xs">Nome,Sessões,Preço,Duração,Intervalo,Descrição,Retorno,Profissional,Sala,Equipamento,Status</code>
                )}
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  A primeira linha deve conter os cabeçalhos. Colunas aceitas em português ou inglês.
                </span>
              </AlertDescription>
            </Alert>

            {/* File upload */}
            <div className="flex items-center gap-3 flex-wrap">
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
              <Button
                variant="ghost"
                onClick={() => {
                  const templates = {
                    services: {
                      filename: 'modelo_importacao_servicos',
                      headers: ['Nome', 'Categoria', 'Preço', 'Duração', 'Descrição', 'Retorno', 'Profissional', 'Sala', 'Equipamento', 'Status'],
                      sampleRows: [
                        ['Limpeza de Pele', 'Estética Facial', '120,00', '60', 'Limpeza profunda', '30', 'Ana Souza', 'Sala 1', 'Alta Frequência', 'Ativo'],
                        ['Massagem; Relaxante', 'Bem-estar', '150,00', '50', 'Inclui aromaterapia', '', '', '', '', 'Ativo'],
                      ],
                    },
                    clients: {
                      filename: 'modelo_importacao_clientes',
                      headers: ['Nome', 'Telefone', 'Email', 'CPF', 'Nascimento', 'Observações'],
                      sampleRows: [
                        ['Maria Silva', '11987654321', 'maria@email.com', '12345678900', '15/03/1990', 'Cliente VIP'],
                        ['João Souza, Jr.', '11912345678', '', '', '', 'Prefere manhã'],
                      ],
                    },
                    package_templates: {
                      filename: 'modelo_importacao_pacotes',
                      headers: ['Nome', 'Sessões', 'Preço', 'Duração', 'Intervalo', 'Descrição', 'Retorno', 'Profissional', 'Sala', 'Equipamento', 'Status'],
                      sampleRows: [
                        ['Pacote Hidratação 10x', '10', '1200,00', '50', '7', 'Hidratação facial completa', '30', 'Ana Souza', 'Sala 1', 'Vapor de Ozônio', 'Ativo'],
                      ],
                    },
                  };
                  downloadCsvTemplate(templates[type] as any);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Baixar modelo CSV
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
                        ) : type === 'clients' ? (
                          <>
                            <th className="p-2 text-left">Nome</th>
                            <th className="p-2 text-left">Telefone</th>
                            <th className="p-2 text-left">Email</th>
                          </>
                        ) : (
                          <>
                            <th className="p-2 text-left">Nome</th>
                            <th className="p-2 text-right">Sessões</th>
                            <th className="p-2 text-right">Preço</th>
                            <th className="p-2 text-right">Duração</th>
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
                          ) : type === 'clients' ? (
                            <>
                              <td className="p-2">{(item as ParsedClient).name}</td>
                              <td className="p-2">{(item as ParsedClient).phone}</td>
                              <td className="p-2">{(item as ParsedClient).email || '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-2">{(item as ParsedPackageTemplate).name}</td>
                              <td className="p-2 text-right">{(item as ParsedPackageTemplate).total_sessions}</td>
                              <td className="p-2 text-right">R$ {(item as ParsedPackageTemplate).price.toFixed(2)}</td>
                              <td className="p-2 text-right">{(item as ParsedPackageTemplate).duration} min</td>
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
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          {parsedData.length > 0 && !result && (
            <Button onClick={handleImport} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {parsedData.length} {type === 'services' ? 'serviços' : type === 'clients' ? 'clientes' : 'modelos de pacote'}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}