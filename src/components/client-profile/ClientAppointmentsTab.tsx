import { useMemo, useState } from 'react';
import { Appointment } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar, Package, Sparkles, Filter, FileDown, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ClientAppointmentsTabProps {
  appointments: Appointment[];
  clientName?: string;
  clientCpf?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Agendado', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  completed: { label: 'Realizado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  missed: { label: 'Faltou', variant: 'destructive' },
  rescheduled: { label: 'Reagendado', variant: 'secondary' },
};

const statusOptions = [
  { value: 'all', label: 'Todos os status' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Realizado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'missed', label: 'Faltou' },
  { value: 'rescheduled', label: 'Reagendado' },
];

const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  return colors[Math.abs(hash) % colors.length];
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

export function ClientAppointmentsTab({ appointments, clientName = '', clientCpf = '' }: ClientAppointmentsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAppointments, setSelectedAppointments] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const filteredAppointments = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    
    return appointments
      .filter(a => {
        try {
          const date = parseISO(a.start_time);
          const inMonth = isWithinInterval(date, { start: monthStart, end: monthEnd });
          const matchesStatus = selectedStatus === 'all' || a.status === selectedStatus;
          return inMonth && matchesStatus;
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [appointments, selectedMonth, selectedStatus]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach(apt => {
      const key = apt.package_appointment?.package?.id || apt.service?.id || '';
      if (key && !map.has(key)) {
        const name = apt.package_appointment?.package?.name || apt.service?.name || '';
        map.set(key, generateColor(name));
      }
    });
    return map;
  }, [appointments]);

  const toggleAppointmentSelection = (id: string) => {
    const newSelection = new Set(selectedAppointments);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedAppointments(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedAppointments.size === filteredAppointments.length) {
      setSelectedAppointments(new Set());
    } else {
      setSelectedAppointments(new Set(filteredAppointments.map(a => a.id)));
    }
  };

  // Helper function to remove accents for PDF compatibility
  const removeAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, (char) => {
        const map: Record<string, string> = {
          'ç': 'c', 'Ç': 'C',
          'ñ': 'n', 'Ñ': 'N',
          'ã': 'a', 'Ã': 'A',
          'õ': 'o', 'Õ': 'O',
        };
        return map[char] || char;
      });
  };

  const handleExportPDF = () => {
    const appointmentsToExport = filteredAppointments.filter(a => selectedAppointments.has(a.id));
    
    if (appointmentsToExport.length === 0) {
      toast.error('Selecione pelo menos um agendamento para exportar');
      return;
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Historico de Agendamentos', 14, 20);
    
    // Client info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const cleanClientName = removeAccents(clientName || 'Nao informado');
    const cleanCpf = clientCpf || 'Nao informado';
    const emissionDate = format(new Date(), "dd/MM/yyyy 'as' HH:mm");
    
    doc.text(`Cliente:  ${cleanClientName}`, 14, 32);
    doc.text(`CPF:  ${cleanCpf}`, 14, 40);
    doc.text(`Data de emissao:  ${emissionDate}`, 14, 48);
    
    // Table data with proper spacing and clean text
    const tableData = appointmentsToExport.map(apt => {
      const serviceName = removeAccents(apt.service?.name || apt.package_appointment?.package?.name || 'Servico');
      const status = removeAccents(statusConfig[apt.status]?.label || apt.status);
      const date = format(new Date(apt.start_time), 'dd/MM/yyyy');
      const startTime = format(new Date(apt.start_time), 'HH:mm');
      const endTime = format(new Date(apt.end_time), 'HH:mm');
      const time = `${startTime}  -  ${endTime}`;
      
      return [serviceName, date, time, status];
    });

    autoTable(doc, {
      startY: 58,
      head: [['Servico', 'Data', 'Horario', 'Status']],
      body: tableData,
      styles: {
        fontSize: 10,
        cellPadding: 5,
        halign: 'left',
        valign: 'middle',
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 6,
      },
      bodyStyles: {
        textColor: [50, 50, 50],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 45, halign: 'center' },
        3: { cellWidth: 35, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    // Footer with summary
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de agendamentos:  ${appointmentsToExport.length}`, 14, finalY);
    
    // Status summary
    const statusCounts = appointmentsToExport.reduce((acc, apt) => {
      const status = removeAccents(statusConfig[apt.status]?.label || apt.status);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    let summaryY = finalY + 8;
    doc.setFont('helvetica', 'normal');
    Object.entries(statusCounts).forEach(([status, count]) => {
      doc.text(`${status}:  ${count}`, 14, summaryY);
      summaryY += 6;
    });

    // Save with clean filename
    const cleanFileName = removeAccents(clientName || 'cliente').replace(/\s+/g, '_');
    const fileName = `agendamentos_${cleanFileName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
    
    toast.success('PDF exportado com sucesso!');
    setSelectedAppointments(new Set());
    setIsSelectionMode(false);
  };

  const startSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedAppointments(new Set());
  };

  const cancelSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedAppointments(new Set());
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        
        {/* Month Filter */}
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {filteredAppointments.length} agendamento(s)
        </span>

        <div className="ml-auto flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={toggleSelectAll}
              >
                {selectedAppointments.size === filteredAppointments.length ? (
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Square className="h-3.5 w-3.5 mr-1" />
                )}
                {selectedAppointments.size === filteredAppointments.length ? 'Desmarcar' : 'Selecionar'} todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={cancelSelectionMode}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleExportPDF}
                disabled={selectedAppointments.size === 0}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" />
                Exportar PDF ({selectedAppointments.size})
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={startSelectionMode}
              disabled={filteredAppointments.length === 0}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              Exportar PDF
            </Button>
          )}
        </div>
      </div>

      {/* Appointments List */}
      <Card>
        <CardContent className="p-3">
          {filteredAppointments.length === 0 ? (
            <div className="py-6 text-center">
              <Calendar className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum agendamento encontrado</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {filteredAppointments.map((appointment) => {
                const status = statusConfig[appointment.status] || statusConfig.scheduled;
                const isPackage = !!appointment.package_appointment;
                const colorKey = appointment.package_appointment?.package?.id || appointment.service?.id || '';
                const borderColor = colorMap.get(colorKey) || '#999';
                const isSelected = selectedAppointments.has(appointment.id);

                return (
                  <div
                    key={appointment.id}
                    className={`p-2.5 rounded-lg bg-card hover:bg-muted/30 transition-colors border-l-3 ${
                      isSelectionMode ? 'cursor-pointer' : ''
                    } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                    style={{ borderLeftColor: borderColor, borderLeftWidth: '3px' }}
                    onClick={isSelectionMode ? () => toggleAppointmentSelection(appointment.id) : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isSelectionMode && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAppointmentSelection(appointment.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          />
                        )}
                        {isPackage ? (
                          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">
                          {appointment.service?.name || appointment.package_appointment?.package?.name || 'Serviço'}
                        </span>
                        <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                          {status.label}
                        </Badge>
                        {isPackage && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/5 shrink-0">
                            {appointment.package_appointment?.session_number}/{appointment.package_appointment?.package?.total_sessions}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-primary shrink-0">
                        R$ {(appointment.service?.price || 0).toFixed(0)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(appointment.start_time), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(appointment.start_time), 'HH:mm')} - {format(new Date(appointment.end_time), 'HH:mm')}
                      </div>
                    </div>

                    {appointment.notes && (
                      <p className="mt-1 text-[10px] text-muted-foreground italic truncate">
                        {appointment.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
