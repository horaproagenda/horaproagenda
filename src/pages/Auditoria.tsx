import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Shield, Filter, Download, Eye, X, FileText } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuditLogs, AuditLog } from '@/hooks/useAuditLogs';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { exportToCSV } from '@/lib/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccessLogsTable } from '@/components/auditoria/AccessLogsTable';

const tableNameMap: Record<string, string> = {
  clients: 'Clientes',
  appointments: 'Agendamentos',
  services: 'Serviços',
  service_packages: 'Pacotes',
  financial_entries: 'Financeiro',
  cash_transactions: 'Transações',
  products: 'Produtos',
  professionals: 'Profissionais',
  user_roles: 'Permissões',
};

const actionMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  INSERT: { label: 'Criação', variant: 'default' },
  UPDATE: { label: 'Edição', variant: 'secondary' },
  DELETE: { label: 'Exclusão', variant: 'destructive' },
};

// Normalize text for PDF (remove accents)
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function Auditoria() {
  const [filters, setFilters] = useLocalStorage('auditoria-filters', {
    tableName: '',
    action: '',
    startDate: '',
    endDate: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { auditLogs, isLoading } = useAuditLogs({
    tableName: filters.tableName || undefined,
    action: filters.action || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const activeFiltersCount = [filters.tableName, filters.action, filters.startDate, filters.endDate].filter(Boolean).length;

  const handleExportCSV = () => {
    exportToCSV({
      filename: 'audit_logs',
      headers: ['Data/Hora', 'Tabela', 'Ação', 'Usuário', 'Descrição'],
      rows: auditLogs.map(log => [
        format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
        tableNameMap[log.table_name] || log.table_name,
        actionMap[log.action]?.label || log.action,
        log.user_email || 'Sistema',
        getHumanReadableDescription(log),
      ]),
      successMessage: 'Logs exportados em CSV!',
    });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text(normalizeText('Relatório de Auditoria'), 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(normalizeText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), 14, 28);
    
    if (activeFiltersCount > 0) {
      const filterTexts: string[] = [];
      if (filters.tableName) filterTexts.push(`Tabela: ${tableNameMap[filters.tableName] || filters.tableName}`);
      if (filters.action) filterTexts.push(`Acao: ${actionMap[filters.action]?.label || filters.action}`);
      if (filters.startDate) filterTexts.push(`De: ${format(new Date(filters.startDate), 'dd/MM/yyyy')}`);
      if (filters.endDate) filterTexts.push(`Ate: ${format(new Date(filters.endDate), 'dd/MM/yyyy')}`);
      doc.text(normalizeText(`Filtros: ${filterTexts.join(' | ')}`), 14, 34);
    }
    
    // Table
    const tableData = auditLogs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yy HH:mm'),
      normalizeText(tableNameMap[log.table_name] || log.table_name),
      normalizeText(actionMap[log.action]?.label || log.action),
      log.user_email?.split('@')[0] || 'Sistema',
      normalizeText(getHumanReadableDescription(log).substring(0, 80)),
    ]);

    autoTable(doc, {
      startY: activeFiltersCount > 0 ? 40 : 34,
      head: [['Data/Hora', 'Tabela', 'Acao', 'Usuario', 'Descricao']],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20 },
        3: { cellWidth: 30 },
        4: { cellWidth: 'auto' },
      },
    });

    doc.save(`auditoria_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('Relatório PDF exportado com sucesso!');
  };

  const clearFilters = () => {
    setFilters({ tableName: '', action: '', startDate: '', endDate: '' });
  };

  return (
    <AppLayout title="Auditoria" subtitle="Logs de segurança e alterações">
      <div className="space-y-4 page-enter">
        <Tabs defaultValue="changes" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="changes" className="text-xs">Alterações</TabsTrigger>
            <TabsTrigger value="access" className="text-xs">Acessos</TabsTrigger>
          </TabsList>
          <TabsContent value="access" className="mt-4">
            <AccessLogsTable />
          </TabsContent>
          <TabsContent value="changes" className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-wide">Logs de Auditoria</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  Filtros
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] min-w-4 justify-center">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Filtros</p>
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>
                        Limpar
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Tabela</Label>
                    <Select
                      value={filters.tableName || "all"}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, tableName: value === "all" ? "" : value }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.entries(tableNameMap).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Ação</Label>
                    <Select
                      value={filters.action || "all"}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, action: value === "all" ? "" : value }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="INSERT">Criação</SelectItem>
                        <SelectItem value="UPDATE">Edição</SelectItem>
                        <SelectItem value="DELETE">Exclusão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Início</Label>
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Fim</Label>
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Exportar CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  Exportar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active filters badges */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {filters.tableName && (
              <Badge variant="secondary" className="h-6 text-[10px] gap-1">
                {tableNameMap[filters.tableName] || filters.tableName}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, tableName: '' }))} />
              </Badge>
            )}
            {filters.action && (
              <Badge variant="secondary" className="h-6 text-[10px] gap-1">
                {actionMap[filters.action]?.label || filters.action}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, action: '' }))} />
              </Badge>
            )}
            {filters.startDate && (
              <Badge variant="secondary" className="h-6 text-[10px] gap-1">
                De: {format(new Date(filters.startDate), 'dd/MM/yy')}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, startDate: '' }))} />
              </Badge>
            )}
            {filters.endDate && (
              <Badge variant="secondary" className="h-6 text-[10px] gap-1">
                Até: {format(new Date(filters.endDate), 'dd/MM/yy')}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, endDate: '' }))} />
              </Badge>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium tracking-wide">Registros ({auditLogs.length})</CardTitle>
            </div>
            <CardDescription className="text-xs">Últimas alterações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum registro encontrado
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data/Hora</TableHead>
                      <TableHead className="text-xs">Tabela</TableHead>
                      <TableHead className="text-xs">Ação</TableHead>
                      <TableHead className="text-xs">Usuário</TableHead>
                      <TableHead className="text-xs w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {tableNameMap[log.table_name] || log.table_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionMap[log.action]?.variant || 'default'} className="text-[10px] h-5">
                            {actionMap[log.action]?.label || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[150px]">{log.user_email || 'Sistema'}</TableCell>
                        <TableCell>
                          <AuditDetailDialog log={log} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// Field labels for human-readable display
const fieldLabels: Record<string, string> = {
  id: 'ID',
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  cpf: 'CPF',
  address: 'Endereço',
  notes: 'Observações',
  is_active: 'Ativo',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  created_by: 'Criado por',
  updated_by: 'Atualizado por',
  start_time: 'Horário Início',
  end_time: 'Horário Fim',
  status: 'Status',
  payment_status: 'Status Pagamento',
  amount_paid: 'Valor Pago',
  price: 'Preço',
  duration: 'Duração',
  category: 'Categoria',
  description: 'Descrição',
  client_id: 'Cliente',
  service_id: 'Serviço',
  professional_id: 'Profissional',
  room_id: 'Sala',
  package_appointment_id: 'Sessão do Pacote',
  total_sessions: 'Total de Sessões',
  sessions_scheduled: 'Sessões Agendadas',
  total_price: 'Preço Total',
  credit_balance: 'Saldo de Crédito',
  commission_rate: 'Taxa de Comissão',
  specialties: 'Especialidades',
  bio: 'Biografia',
  user_id: 'ID do Usuário',
  role: 'Função',
  type: 'Tipo',
  amount: 'Valor',
  due_date: 'Data de Vencimento',
  paid_date: 'Data de Pagamento',
  quantity: 'Quantidade',
  current_stock: 'Estoque Atual',
  min_stock: 'Estoque Mínimo',
  cost_price: 'Preço de Custo',
  sale_price: 'Preço de Venda',
  payment_methods: 'Formas de Pagamento',
  card_fee_amount: 'Taxa do Cartão',
  installments: 'Parcelas',
  template_id: 'Template',
  interval_days: 'Intervalo (dias)',
  equipment: 'Equipamentos',
  return_days: 'Retorno (dias)',
};

const statusLabels: Record<string, string> = {
  scheduled: 'Agendado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  missed: 'Falta',
  rescheduled: 'Reagendado',
  pending: 'Pendente',
  paid: 'Pago',
  partial: 'Parcial',
  active: 'Ativo',
  inactive: 'Inativo',
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  professional: 'Profissional',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (key === 'is_active') return value ? 'Sim' : 'Não';
  
  // Format status fields
  if (key === 'status' || key === 'payment_status' || key === 'role') {
    return statusLabels[String(value)] || String(value);
  }
  
  // Format money
  if (['price', 'amount_paid', 'total_price', 'amount', 'credit_balance', 'cost_price', 'sale_price', 'card_fee_amount'].includes(key)) {
    const num = Number(value);
    return isNaN(num) ? String(value) : `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  
  // Format percentages
  if (key === 'commission_rate') {
    return `${value}%`;
  }
  
  // Format duration
  if (key === 'duration' || key === 'interval_days' || key === 'return_days') {
    return `${value} ${key === 'duration' ? 'min' : 'dias'}`;
  }
  
  // Format dates
  if (key.includes('_at') || key.includes('_date') || key === 'start_time' || key === 'end_time') {
    try {
      return format(new Date(String(value)), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return String(value);
    }
  }
  
  // Format arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Nenhum';
    return value.join(', ');
  }
  
  // Format objects
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
}

// Generate a human-readable description of the log entry
function getHumanReadableDescription(log: AuditLog): string {
  const tableName = tableNameMap[log.table_name] || log.table_name;
  const data = log.new_data || log.old_data;
  const name = data?.name || data?.email || '';

  // For products - show stock changes
  if (log.table_name === 'products') {
    if (log.action === 'DELETE') {
      const oldStock = log.old_data?.current_stock ?? 0;
      return `Produto "${log.old_data?.name || 'sem nome'}" excluído. Estoque: ${oldStock} unidades removidas do sistema.`;
    }
    if (log.action === 'INSERT') {
      const newStock = log.new_data?.current_stock ?? 0;
      return `Produto "${log.new_data?.name}" cadastrado com estoque inicial de ${newStock} unidades.`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const oldStock = Number(log.old_data.current_stock ?? 0);
      const newStock = Number(log.new_data.current_stock ?? 0);
      if (oldStock !== newStock) {
        const diff = newStock - oldStock;
        return `Estoque do produto "${log.new_data.name}" alterado: ${oldStock} → ${newStock} (${diff > 0 ? '+' : ''}${diff} unidades).`;
      }
      return `Produto "${log.new_data.name}" atualizado.`;
    }
  }

  // For appointments - show client, service, status
  if (log.table_name === 'appointments') {
    if (log.action === 'DELETE') {
      return `Agendamento excluído.`;
    }
    if (log.action === 'INSERT') {
      const statusKey = String(log.new_data?.status || '');
      const status = statusLabels[statusKey] || statusKey;
      return `Novo agendamento criado (${status}).`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changes: string[] = [];
      const oldStatus = String(log.old_data.status || '');
      const newStatus = String(log.new_data.status || '');
      if (oldStatus !== newStatus) {
        changes.push(`Status: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`);
      }
      const oldPayment = String(log.old_data.payment_status || '');
      const newPayment = String(log.new_data.payment_status || '');
      if (oldPayment !== newPayment) {
        changes.push(`Pagamento: ${statusLabels[oldPayment] || oldPayment} → ${statusLabels[newPayment] || newPayment}`);
      }
      if (log.old_data.start_time !== log.new_data.start_time) {
        changes.push(`Horário alterado`);
      }
      return changes.length > 0 ? `Agendamento atualizado: ${changes.join('; ')}` : 'Agendamento atualizado.';
    }
  }

  // For services
  if (log.table_name === 'services') {
    if (log.action === 'DELETE') {
      return `Serviço "${log.old_data?.name}" excluído.`;
    }
    if (log.action === 'INSERT') {
      const price = log.new_data?.price ? `R$ ${Number(log.new_data.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
      return `Serviço "${log.new_data?.name}" cadastrado${price ? ` (${price})` : ''}.`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changes: string[] = [];
      if (log.old_data.price !== log.new_data.price) {
        changes.push(`Preço: R$ ${Number(log.old_data.price).toFixed(2)} → R$ ${Number(log.new_data.price).toFixed(2)}`);
      }
      if (log.old_data.duration !== log.new_data.duration) {
        changes.push(`Duração: ${log.old_data.duration}min → ${log.new_data.duration}min`);
      }
      if (log.old_data.is_active !== log.new_data.is_active) {
        changes.push(`Status: ${log.new_data.is_active ? 'Ativado' : 'Desativado'}`);
      }
      return changes.length > 0 ? `Serviço "${log.new_data.name}" atualizado: ${changes.join('; ')}` : `Serviço "${log.new_data.name}" atualizado.`;
    }
  }

  // For clients
  if (log.table_name === 'clients') {
    if (log.action === 'DELETE') {
      return `Cliente "${log.old_data?.name}" excluído do sistema.`;
    }
    if (log.action === 'INSERT') {
      return `Cliente "${log.new_data?.name}" cadastrado.`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changes: string[] = [];
      if (log.old_data.credit_balance !== log.new_data.credit_balance) {
        changes.push(`Crédito: R$ ${Number(log.old_data.credit_balance || 0).toFixed(2)} → R$ ${Number(log.new_data.credit_balance || 0).toFixed(2)}`);
      }
      if (log.old_data.is_active !== log.new_data.is_active) {
        changes.push(`Status: ${log.new_data.is_active ? 'Ativado' : 'Desativado'}`);
      }
      return changes.length > 0 ? `Cliente "${log.new_data.name}" atualizado: ${changes.join('; ')}` : `Cliente "${log.new_data.name}" atualizado.`;
    }
  }

  // Default fallback
  if (log.action === 'INSERT') {
    return `${tableName} "${name}" criado.`;
  }
  if (log.action === 'DELETE') {
    return `${tableName} "${name}" excluído.`;
  }
  if (log.action === 'UPDATE') {
    return `${tableName} "${name}" atualizado.`;
  }
  return `Ação em ${tableName}`;
}

function getChangeSummary(log: AuditLog): string {
  return getHumanReadableDescription(log);
}

function AuditDetailDialog({ log }: { log: AuditLog }) {
  const summary = getChangeSummary(log);
  
  // Get changed fields for UPDATE
  const changedFields: string[] = [];
  if (log.action === 'UPDATE' && log.old_data && log.new_data) {
    for (const key of Object.keys(log.new_data)) {
      if (JSON.stringify(log.old_data[key]) !== JSON.stringify(log.new_data[key])) {
        changedFields.push(key);
      }
    }
  }
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Detalhes da Alteração</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{summary}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Por {log.user_email || 'Sistema'} em {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
            </p>
          </div>

          {/* For INSERT - show new data */}
          {log.action === 'INSERT' && log.new_data && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Dados Criados</Label>
              <ScrollArea className="h-48">
                <div className="space-y-1.5">
                  {Object.entries(log.new_data)
                    .filter(([key]) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{fieldLabels[key] || key}</span>
                        <span className="font-medium text-right max-w-[60%] truncate">{formatValue(key, value)}</span>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* For DELETE - show deleted data */}
          {log.action === 'DELETE' && log.old_data && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Dados Excluídos</Label>
              <ScrollArea className="h-48">
                <div className="space-y-1.5">
                  {Object.entries(log.old_data)
                    .filter(([key]) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{fieldLabels[key] || key}</span>
                        <span className="font-medium text-right max-w-[60%] truncate line-through text-destructive/70">{formatValue(key, value)}</span>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* For UPDATE - show changes side by side */}
          {log.action === 'UPDATE' && log.old_data && log.new_data && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Alterações Realizadas</Label>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {changedFields.length > 0 ? (
                    changedFields.map((key) => (
                      <div key={key} className="p-2 bg-muted/50 rounded-md">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{fieldLabels[key] || key}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-sm">
                            <span className="text-destructive/70 line-through">{formatValue(key, log.old_data?.[key])}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-success font-medium">{formatValue(key, log.new_data?.[key])}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma alteração detectada</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
