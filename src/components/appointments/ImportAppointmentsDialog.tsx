import { useState, useCallback } from 'react';
import { format, parse, isValid, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Download,
  Loader2,
  Info,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useServices } from '@/hooks/useServices';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useRooms } from '@/hooks/useRooms';
import { useAppointments } from '@/hooks/useAppointments';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseCsv, downloadCsvTemplate } from '@/lib/exportUtils';

interface ImportAppointmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedAppointment {
  rowIndex: number;
  date: string;
  startTime: string;
  endTime?: string;
  clientName: string;
  clientPhone?: string;
  serviceName?: string;
  professionalName?: string;
  roomName?: string;
  notes?: string;
  // Resolved IDs
  clientId?: string;
  serviceId?: string;
  professionalId?: string;
  roomId?: string;
  duration?: number;
  // Validation
  errors: string[];
  warnings: string[];
  hasConflict: boolean;
}

export function ImportAppointmentsDialog({ open, onOpenChange }: ImportAppointmentsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedAppointment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'validating' | 'importing' | 'done'>('idle');
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const { clients } = useClients();
  const { services } = useServices();
  const { professionals } = useProfessionals();
  const { rooms } = useRooms();
  const { appointments, createAppointment } = useAppointments();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedData([]);
      setImportStatus('idle');
      setImportResults({ success: 0, failed: 0 });
    }
  };

  const normalizeString = (str: string) => 
    str?.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';

  const normalizePhone = (phone: string) => 
    phone?.replace(/\D/g, '') || '';

  const parseCSV = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setImportStatus('validating');

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length < 2) {
        toast.error('Arquivo CSV vazio ou sem dados');
        setIsProcessing(false);
        return;
      }

      // Parse header (já vem separado corretamente pelo parseCsv)
      const headers = rows[0].map((h) => normalizeString(h));

      // Map column indices
      const colMap = {
        date: headers.findIndex(h => h.includes('data')),
        startTime: headers.findIndex(h => h.includes('inicio') || h.includes('horario')),
        endTime: headers.findIndex(h => h.includes('fim') || h.includes('termino')),
        clientName: headers.findIndex(h => h.includes('cliente') || h.includes('nome')),
        clientPhone: headers.findIndex(h => h.includes('telefone') || h.includes('celular') || h.includes('fone')),
        serviceName: headers.findIndex(h => h.includes('servico')),
        professionalName: headers.findIndex(h => h.includes('profissional')),
        roomName: headers.findIndex(h => h.includes('sala')),
        notes: headers.findIndex(h => h.includes('observ') || h.includes('nota')),
      };

      // Validate required columns
      if (colMap.date === -1 || colMap.startTime === -1 || colMap.clientName === -1) {
        toast.error('Colunas obrigatórias não encontradas: Data, Horário Início, Cliente');
        setIsProcessing(false);
        return;
      }

      const parsed: ParsedAppointment[] = [];

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].map((c) => (c ?? '').trim());

        const row: ParsedAppointment = {
          rowIndex: i + 1,
          date: cols[colMap.date] || '',
          startTime: cols[colMap.startTime] || '',
          endTime: colMap.endTime >= 0 ? cols[colMap.endTime] : undefined,
          clientName: cols[colMap.clientName] || '',
          clientPhone: colMap.clientPhone >= 0 ? cols[colMap.clientPhone] : undefined,
          serviceName: colMap.serviceName >= 0 ? cols[colMap.serviceName] : undefined,
          professionalName: colMap.professionalName >= 0 ? cols[colMap.professionalName] : undefined,
          roomName: colMap.roomName >= 0 ? cols[colMap.roomName] : undefined,
          notes: colMap.notes >= 0 ? cols[colMap.notes] : undefined,
          errors: [],
          warnings: [],
          hasConflict: false,
        };

        // Skip empty rows
        if (!row.date && !row.clientName) continue;

        validateAndResolve(row);
        parsed.push(row);
      }


      setParsedData(parsed);
      setImportStatus('idle');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Erro ao processar arquivo CSV');
    }

    setIsProcessing(false);
  }, [file, clients, services, professionals, rooms, appointments]);

  const validateAndResolve = (row: ParsedAppointment) => {
    // Parse date
    let parsedDate: Date | null = null;
    const dateFormats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'd/M/yyyy', 'dd-MM-yyyy'];
    
    for (const fmt of dateFormats) {
      try {
        const d = parse(row.date, fmt, new Date());
        if (isValid(d)) {
          parsedDate = d;
          break;
        }
      } catch {}
    }

    if (!parsedDate) {
      row.errors.push(`Data inválida: ${row.date}`);
    }

    // Parse time
    const timeMatch = row.startTime.match(/(\d{1,2}):?(\d{2})?/);
    if (!timeMatch) {
      row.errors.push(`Horário inválido: ${row.startTime}`);
    }

    // Resolve client
    const normalizedClientName = normalizeString(row.clientName);
    const normalizedClientPhone = normalizePhone(row.clientPhone || '');
    
    const matchedClient = clients.find(c => {
      const nameMatch = normalizeString(c.name) === normalizedClientName ||
        normalizeString(c.name).includes(normalizedClientName) ||
        normalizedClientName.includes(normalizeString(c.name));
      const phoneMatch = normalizedClientPhone && normalizePhone(c.phone).includes(normalizedClientPhone);
      return nameMatch || phoneMatch;
    });

    if (matchedClient) {
      row.clientId = matchedClient.id;
    } else {
      row.errors.push(`Cliente não encontrado: ${row.clientName}`);
    }

    // Resolve service
    if (row.serviceName) {
      const normalizedService = normalizeString(row.serviceName);
      const matchedService = services.find(s => 
        normalizeString(s.name) === normalizedService ||
        normalizeString(s.name).includes(normalizedService)
      );

      if (matchedService) {
        row.serviceId = matchedService.id;
        row.duration = matchedService.duration;
        
        // Use service's default professional and room if not specified
        if (!row.professionalName && matchedService.professional_id) {
          row.professionalId = matchedService.professional_id;
        }
        if (!row.roomName && matchedService.room_id) {
          row.roomId = matchedService.room_id;
        }
      } else {
        row.warnings.push(`Serviço não encontrado: ${row.serviceName}`);
      }
    }

    // Resolve professional
    if (row.professionalName) {
      const normalizedProf = normalizeString(row.professionalName);
      const matchedProf = professionals.find(p => 
        normalizeString(p.name) === normalizedProf ||
        normalizeString(p.name).includes(normalizedProf)
      );

      if (matchedProf) {
        row.professionalId = matchedProf.id;
      } else {
        row.warnings.push(`Profissional não encontrado: ${row.professionalName}`);
      }
    }

    // Resolve room
    if (row.roomName) {
      const normalizedRoom = normalizeString(row.roomName);
      const matchedRoom = rooms.find(r => 
        normalizeString(r.name) === normalizedRoom ||
        normalizeString(r.name).includes(normalizedRoom)
      );

      if (matchedRoom) {
        row.roomId = matchedRoom.id;
      } else {
        row.warnings.push(`Sala não encontrada: ${row.roomName}`);
      }
    }

    // Check for conflicts
    if (parsedDate && row.professionalId) {
      const timeMatch = row.startTime.match(/(\d{1,2}):?(\d{2})?/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const startDateTime = new Date(parsedDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const duration = row.duration || 60;
        const endDateTime = addMinutes(startDateTime, duration);

        const hasConflict = appointments.some(apt => {
          const aptStart = new Date(apt.start_time);
          const aptEnd = new Date(apt.end_time);
          const aptProfId = apt.professional_id || apt.service?.professional_id;
          
          if (aptProfId !== row.professionalId) return false;
          
          return startDateTime < aptEnd && endDateTime > aptStart;
        });

        if (hasConflict) {
          row.hasConflict = true;
          row.errors.push('Conflito de horário com agendamento existente');
        }
      }
    }
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.errors.length === 0);
    
    if (validRows.length === 0) {
      toast.error('Nenhum registro válido para importar');
      return;
    }

    setImportStatus('importing');
    setImportProgress(0);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      
      try {
        // Parse date and time
        const dateFormats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'd/M/yyyy', 'dd-MM-yyyy'];
        let parsedDate: Date | null = null;
        
        for (const fmt of dateFormats) {
          try {
            const d = parse(row.date, fmt, new Date());
            if (isValid(d)) {
              parsedDate = d;
              break;
            }
          } catch {}
        }

        if (!parsedDate || !row.clientId) {
          failed++;
          continue;
        }

        const timeMatch = row.startTime.match(/(\d{1,2}):?(\d{2})?/);
        if (!timeMatch) {
          failed++;
          continue;
        }

        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        
        const startDateTime = new Date(parsedDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const duration = row.duration || 60;
        const endDateTime = addMinutes(startDateTime, duration);

        await createAppointment.mutateAsync({
          client_id: row.clientId,
          service_id: row.serviceId || null,
          professional_id: row.professionalId || null,
          room_id: row.roomId || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          notes: row.notes || undefined,
        });

        success++;
      } catch (error) {
        console.error('Error importing row:', error);
        failed++;
      }

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setImportResults({ success, failed });
    setImportStatus('done');
    
    if (success > 0) {
      toast.success(`${success} agendamentos importados com sucesso!`);
    }
    if (failed > 0) {
      toast.error(`${failed} agendamentos falharam`);
    }
  };

  const downloadTemplate = () => {
    const template = `Data;Horário Início;Horário Fim;Cliente;Telefone;Serviço;Profissional;Sala;Observações
15/01/2026;09:00;10:00;Maria Silva;11999998888;Limpeza de Pele;Ana Costa;Sala 1;Cliente preferencial
15/01/2026;10:30;11:30;João Santos;11988887777;Massagem Relaxante;Carlos Lima;Sala 2;`;

    const blob = new Blob(['\ufeff' + template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_importacao_agendamentos.csv';
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success('Modelo baixado!');
  };

  const validCount = parsedData.filter(r => r.errors.length === 0).length;
  const errorCount = parsedData.filter(r => r.errors.length > 0).length;
  const warningCount = parsedData.filter(r => r.warnings.length > 0).length;

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setImportStatus('idle');
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Agendamentos
          </DialogTitle>
          <DialogDescription>
            Importe agendamentos em massa através de um arquivo CSV
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4">
          {/* Instructions */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O arquivo deve conter as colunas: <strong>Data</strong>, <strong>Horário Início</strong>, <strong>Cliente</strong>.
              Colunas opcionais: Horário Fim, Telefone, Serviço, Profissional, Sala, Observações.
            </AlertDescription>
          </Alert>

          {/* File input */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor="csv-file" className="sr-only">Arquivo CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              Modelo
            </Button>
            {file && (
              <Button size="sm" onClick={parseCSV} disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                )}
                Processar
              </Button>
            )}
          </div>

          {/* Results summary */}
          {parsedData.length > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {parsedData.length} registros
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {validCount} válidos
                </Badge>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {errorCount} com erros
                  </Badge>
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge className="gap-1 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">
                    <AlertCircle className="h-3 w-3" />
                    {warningCount} avisos
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Import progress */}
          {importStatus === 'importing' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando agendamentos...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Import done */}
          {importStatus === 'done' && (
            <Alert className={cn(
              importResults.failed === 0 ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'
            )}>
              <CheckCircle2 className={cn(
                'h-4 w-4',
                importResults.failed === 0 ? 'text-green-500' : 'text-yellow-500'
              )} />
              <AlertDescription>
                Importação concluída! {importResults.success} sucesso, {importResults.failed} falhas.
              </AlertDescription>
            </Alert>
          )}

          {/* Parsed data preview */}
          {parsedData.length > 0 && importStatus !== 'done' && (
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-2">
                {parsedData.map((row, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      'p-2 rounded border text-xs',
                      row.errors.length > 0 
                        ? 'border-destructive/50 bg-destructive/5' 
                        : row.warnings.length > 0
                          ? 'border-yellow-500/50 bg-yellow-500/5'
                          : 'border-border bg-card'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-muted-foreground">#{row.rowIndex}</span>
                        <span className="font-medium truncate">{row.clientName}</span>
                        <span className="text-muted-foreground">{row.date}</span>
                        <span className="text-muted-foreground">{row.startTime}</span>
                        {row.serviceName && (
                          <Badge variant="outline" className="text-[10px]">
                            {row.serviceName}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {row.errors.length > 0 && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {row.errors.length === 0 && row.warnings.length > 0 && (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )}
                        {row.errors.length === 0 && row.warnings.length === 0 && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                    {(row.errors.length > 0 || row.warnings.length > 0) && (
                      <div className="mt-1 space-y-0.5">
                        {row.errors.map((err, i) => (
                          <p key={`err-${i}`} className="text-destructive text-[10px]">
                            ✗ {err}
                          </p>
                        ))}
                        {row.warnings.map((warn, i) => (
                          <p key={`warn-${i}`} className="text-yellow-600 text-[10px]">
                            ⚠ {warn}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            {importStatus === 'done' ? 'Fechar' : 'Cancelar'}
          </Button>
          {parsedData.length > 0 && validCount > 0 && importStatus !== 'done' && (
            <Button 
              onClick={handleImport} 
              disabled={importStatus === 'importing'}
              className="gap-1"
            >
              {importStatus === 'importing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar {validCount} registros
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
