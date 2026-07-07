import { useState, useRef, useMemo } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import readXlsxFile from 'read-excel-file';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseCsv, downloadCsvTemplate } from '@/lib/exportUtils';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfessionals } from '@/hooks/useProfessionals';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ParsedClient {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthdate?: string;
  notes?: string;
  referral_source?: string;
  professional_name?: string;
  assigned_professional_id?: string | null;
  is_active: boolean;
  valid: boolean;
  error?: string;
}


interface BulkImportClientsDialogProps {
  onImported?: () => void;
  children?: React.ReactNode;
}

const NONE_VALUE = '__none__';

const normalizeName = (value: string): string =>
  (value ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export function BulkImportClientsDialog({ onImported, children }: BulkImportClientsDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { professionals } = useProfessionals();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [fileName, setFileName] = useState('');
  const [defaultProfessionalId, setDefaultProfessionalId] = useState<string>(NONE_VALUE);

  const activeProfessionals = useMemo(
    () => professionals.filter((p) => p.is_active),
    [professionals],
  );

  const professionalByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of professionals) {
      map.set(normalizeName(p.name), p.id);
    }
    return map;
  }, [professionals]);

  const resolveProfessionalId = (name?: string): string | null => {
    const key = normalizeName(name || '');
    if (!key) return null;
    return professionalByName.get(key) || null;
  };

  const normalizePhone = (phone: string): string => {
    if (!phone) return '';
    return phone.toString().replace(/\D/g, '');
  };

  const parseBirthdate = (dateStr: string): string | undefined => {
    if (!dateStr) return undefined;
    const cleanDate = dateStr.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return cleanDate;
    const brMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const usMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      if (parseInt(month) > 12) {
        return `${year}-${day.padStart(2, '0')}-${month.padStart(2, '0')}`;
      }
    }
    const serialNumber = parseFloat(cleanDate);
    if (!isNaN(serialNumber) && serialNumber > 10000 && serialNumber < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + serialNumber * 86400000);
      return date.toISOString().split('T')[0];
    }
    return undefined;
  };

  const parseIsActive = (value?: string): boolean => {
    if (value === undefined || value === null) return true;
    const v = value.toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!v) return true;
    if (['inativo', 'inactive', 'inativa', 'nao', 'no', 'false', '0', 'desativado', 'desativada'].includes(v)) return false;
    return true;
  };

  const validateClient = (client: Partial<ParsedClient> & { status?: string }): ParsedClient => {
    const errors: string[] = [];

    if (!client.name || client.name.trim().length < 2) errors.push('Nome inválido');

    const phone = normalizePhone(client.phone || '');
    if (!phone || phone.length < 10) errors.push('Telefone inválido (mín. 10 dígitos)');

    const birthdate = parseBirthdate(client.birthdate || '');

    const professionalName = client.professional_name?.trim() || undefined;
    let assignedProfId: string | null = null;
    if (professionalName) {
      assignedProfId = resolveProfessionalId(professionalName);
      if (!assignedProfId) {
        errors.push(`Profissional "${professionalName}" não encontrado`);
      }
    }

    return {
      name: client.name?.trim() || '',
      phone,
      email: client.email?.trim() || undefined,
      cpf: client.cpf?.toString().replace(/\D/g, '') || undefined,
      birthdate,
      notes: client.notes?.trim() || undefined,
      referral_source: client.referral_source?.trim() || undefined,
      professional_name: professionalName,
      assigned_professional_id: assignedProfId,
      is_active: parseIsActive(client.status),
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join(', ') : undefined,
    };
  };


  const parseExcelFile = async (file: File): Promise<ParsedClient[]> => {
    try {
      const rows = await readXlsxFile(file);
      if (rows.length === 0) throw new Error('Arquivo vazio');

      const headerRow = rows[0].map((cell) => String(cell || '').toLowerCase());
      const findColumnIndex = (keywords: string[]): number =>
        headerRow.findIndex((h) => keywords.some((k) => h.includes(k)));

      const nameIdx = findColumnIndex(['nome', 'name']);
      const phoneIdx = findColumnIndex(['telefone', 'phone', 'celular']);
      const emailIdx = findColumnIndex(['email', 'e-mail']);
      const cpfIdx = findColumnIndex(['cpf']);
      const birthdateIdx = findColumnIndex(['nascimento', 'birthdate', 'data_nascimento']);
      const notesIdx = findColumnIndex(['observ', 'notes', 'obs']);
      const referralIdx = findColumnIndex(['indica', 'referral', 'origem']);
      const profIdx = findColumnIndex(['profissional', 'professional', 'colaborador', 'responsavel', 'responsável']);
      const statusIdx = findColumnIndex(['status', 'ativo', 'situacao', 'situação']);


      const hasHeader = nameIdx >= 0 || phoneIdx >= 0;
      const startRow = hasHeader ? 1 : 0;
      const finalNameIdx = nameIdx >= 0 ? nameIdx : 0;
      const finalPhoneIdx = phoneIdx >= 0 ? phoneIdx : 1;

      const clients: ParsedClient[] = [];

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const getValue = (idx: number): string => {
          if (idx < 0 || idx >= row.length) return '';
          const cell = row[idx];
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return cell.toISOString().split('T')[0];
          return String(cell);
        };

        const name = getValue(finalNameIdx);
        if (!name.trim()) continue;

        clients.push(
          validateClient({
            name,
            phone: getValue(finalPhoneIdx),
            email: emailIdx >= 0 ? getValue(emailIdx) : undefined,
            cpf: cpfIdx >= 0 ? getValue(cpfIdx) : undefined,
            birthdate: birthdateIdx >= 0 ? getValue(birthdateIdx) : undefined,
            notes: notesIdx >= 0 ? getValue(notesIdx) : undefined,
            referral_source: referralIdx >= 0 ? getValue(referralIdx) : undefined,
            professional_name: profIdx >= 0 ? getValue(profIdx) : undefined,
            status: statusIdx >= 0 ? getValue(statusIdx) : undefined,

          }),
        );
      }

      return clients;
    } catch (error: any) {
      throw new Error('Erro ao processar arquivo Excel: ' + (error.message || 'formato inválido'));
    }
  };

  const parseTextFile = (file: File): Promise<ParsedClient[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const rows = parseCsv(text);
          if (rows.length === 0) {
            reject(new Error('Arquivo vazio'));
            return;
          }

          const firstLineLower = rows[0].join(' ').toLowerCase();
          const hasHeader =
            firstLineLower.includes('nome') ||
            firstLineLower.includes('name') ||
            firstLineLower.includes('telefone') ||
            firstLineLower.includes('phone');

          let nameIdx = 0,
            phoneIdx = 1,
            emailIdx = 2,
            cpfIdx = 3,
            birthdateIdx = 4,
            notesIdx = 5,
            referralIdx = 6,
            profIdx = -1,
            statusIdx = -1;


          if (hasHeader) {
            const headers = rows[0].map((h) => h.trim().toLowerCase());
            nameIdx = headers.findIndex((h) => h.includes('nome') || h === 'name');
            phoneIdx = headers.findIndex(
              (h) => h.includes('telefone') || h === 'phone' || h.includes('celular'),
            );
            emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('e-mail'));
            cpfIdx = headers.findIndex((h) => h.includes('cpf'));
            birthdateIdx = headers.findIndex(
              (h) => h.includes('nascimento') || h.includes('birthdate') || h.includes('data'),
            );
            notesIdx = headers.findIndex(
              (h) => h.includes('obs') || h.includes('notes') || h.includes('observa'),
            );
            referralIdx = headers.findIndex(
              (h) => h.includes('indica') || h.includes('referral') || h.includes('origem'),
            );
            profIdx = headers.findIndex(
              (h) =>
                h.includes('profissional') ||
                h.includes('professional') ||
                h.includes('colaborador') ||
                h.includes('responsav'),
            );
            statusIdx = headers.findIndex(
              (h) => h.includes('status') || h.includes('ativo') || h.includes('situa'),
            );
            if (nameIdx === -1) nameIdx = 0;
            if (phoneIdx === -1) phoneIdx = 1;
          }

          const startIndex = hasHeader ? 1 : 0;
          const clients: ParsedClient[] = [];

          for (let i = startIndex; i < rows.length; i++) {
            const parts = rows[i];
            if (parts.length === 0 || !parts[nameIdx]?.trim()) continue;
            clients.push(
              validateClient({
                name: parts[nameIdx] || '',
                phone: phoneIdx >= 0 ? parts[phoneIdx] || '' : '',
                email: emailIdx >= 0 ? parts[emailIdx] || undefined : undefined,
                cpf: cpfIdx >= 0 ? parts[cpfIdx] || undefined : undefined,
                birthdate: birthdateIdx >= 0 ? parts[birthdateIdx] || undefined : undefined,
                notes: notesIdx >= 0 ? parts[notesIdx] || undefined : undefined,
                referral_source:
                  referralIdx >= 0 ? parts[referralIdx] || undefined : undefined,
                professional_name:
                  profIdx >= 0 ? parts[profIdx] || undefined : undefined,
                status: statusIdx >= 0 ? parts[statusIdx] || undefined : undefined,
              }),

            );
          }

          if (clients.length === 0) {
            reject(new Error('Nenhum cliente encontrado. Verifique o formato do arquivo.'));
            return;
          }

          resolve(clients);
        } catch (error) {
          reject(new Error('Erro ao processar arquivo de texto'));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  };

  const handleDownloadTemplate = () => {
    downloadCsvTemplate({
      filename: 'modelo_importacao_clientes',
      headers: ['Nome', 'Telefone', 'Email', 'CPF', 'Nascimento', 'Observações', 'Indicação', 'Profissional', 'Status'],
      sampleRows: [
        ['Maria Silva', '11987654321', 'maria@email.com', '12345678900', '15/03/1990', 'Cliente VIP', 'Instagram', activeProfessionals[0]?.name || 'Dra. Ana', 'Ativo'],
        ['João Souza, Jr.', '11912345678', '', '', '', 'Prefere horário pela manhã', 'Amigo', '', 'Inativo'],
      ],

    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setParsedClients([]);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let clients: ParsedClient[] = [];

      if (['xlsx', 'xls'].includes(extension || '')) {
        clients = await parseExcelFile(file);
      } else if (['csv', 'txt'].includes(extension || '')) {
        clients = await parseTextFile(file);
      } else if (extension === 'docx' || extension === 'pdf') {
        toast({
          title: 'Formato recomendado',
          description: 'Para melhor resultado, exporte seus dados para Excel (.xlsx) ou CSV antes de importar.',
        });
        setIsLoading(false);
        return;
      } else {
        throw new Error('Formato de arquivo não suportado. Use Excel (.xlsx, .xls) ou CSV.');
      }

      if (clients.length === 0) throw new Error('Nenhum cliente encontrado no arquivo');

      setParsedClients(clients);

      const validCount = clients.filter((c) => c.valid).length;
      toast({
        title: 'Arquivo processado',
        description: `${validCount} de ${clients.length} clientes prontos para importação`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao processar arquivo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    const validClients = parsedClients.filter((c) => c.valid);

    if (validClients.length === 0) {
      toast({
        title: 'Nenhum cliente válido',
        description: 'Corrija os erros antes de importar',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);

    try {
      const fallbackProfId =
        defaultProfessionalId && defaultProfessionalId !== NONE_VALUE
          ? defaultProfessionalId
          : null;

      const clientsToInsert = validClients.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email || null,
        cpf: c.cpf || null,
        birthdate: c.birthdate || null,
        notes: c.notes || null,
        referral_source: c.referral_source || null,
        assigned_professional_id: c.assigned_professional_id || fallbackProfId,
        is_active: true,
        credit_balance: 0,
      }));

      const { error } = await supabase.from('clients').insert(clientsToInsert);

      if (error) throw error;

      toast({
        title: 'Importação concluída!',
        description: `${validClients.length} clientes importados com sucesso`,
      });

      setParsedClients([]);
      setFileName('');
      setDefaultProfessionalId(NONE_VALUE);
      setOpen(false);
      onImported?.();
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const removeClient = (index: number) => {
    setParsedClients((prev) => prev.filter((_, i) => i !== index));
  };

  const validCount = parsedClients.filter((c) => c.valid).length;
  const invalidCount = parsedClients.filter((c) => !c.valid).length;

  const getRowProfessionalLabel = (c: ParsedClient): string => {
    if (c.assigned_professional_id) {
      const p = professionals.find((p) => p.id === c.assigned_professional_id);
      if (p) return p.name;
    }
    if (c.professional_name) return c.professional_name;
    if (defaultProfessionalId && defaultProfessionalId !== NONE_VALUE) {
      const p = professionals.find((p) => p.id === defaultProfessionalId);
      if (p) return `${p.name} (padrão)`;
    }
    return '-';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Importar em Massa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Clientes em Massa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Default professional */}
          <div className="space-y-1.5">
            <Label className="text-sm">Profissional padrão (opcional)</Label>
            <Select value={defaultProfessionalId} onValueChange={setDefaultProfessionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sem profissional padrão</SelectItem>
                {activeProfessionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Será aplicado aos clientes que não tiverem o campo <strong>Profissional</strong> preenchido no arquivo.
            </p>
          </div>

          {/* File Upload Area */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleFileSelect}
              className="hidden"
              id="bulk-import-file"
            />
            <label
              htmlFor="bulk-import-file"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              ) : (
                <Upload className="h-10 w-10 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">{fileName || 'Clique para selecionar um arquivo'}</p>
                <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls) ou CSV</p>
              </div>
            </label>
          </div>

          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">Formato esperado do arquivo:</p>
            <p className="text-muted-foreground">
              O arquivo deve conter colunas com os seguintes nomes (a ordem não importa):
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">Nome *</Badge>
              <Badge variant="secondary">Telefone *</Badge>
              <Badge variant="outline">Email</Badge>
              <Badge variant="outline">CPF</Badge>
              <Badge variant="outline">Nascimento</Badge>
              <Badge variant="outline">Observações</Badge>
              <Badge variant="outline">Indicação</Badge>
              <Badge variant="outline">Profissional</Badge>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              * Campos obrigatórios. O nome do profissional deve corresponder a um profissional cadastrado.
            </p>
          </div>

          {/* Preview Table */}
          {parsedClients.length > 0 && (
            <>
              <div className="flex items-center gap-4">
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {validCount} válidos
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {invalidCount} com erros
                  </Badge>
                )}
              </div>

              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedClients.map((client, index) => (
                      <TableRow key={index} className={!client.valid ? 'bg-destructive/5' : ''}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{client.name || '-'}</TableCell>
                        <TableCell>{client.phone || '-'}</TableCell>
                        <TableCell>{client.email || '-'}</TableCell>
                        <TableCell className="text-xs">{getRowProfessionalLabel(client)}</TableCell>
                        <TableCell>
                          {client.valid ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              {client.error}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeClient(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="pt-4 border-t flex-wrap gap-2">
          <Button variant="ghost" type="button" onClick={handleDownloadTemplate} className="mr-auto">
            <FileText className="h-4 w-4 mr-2" />
            Baixar modelo CSV
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={validCount === 0 || isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {validCount} Cliente{validCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
