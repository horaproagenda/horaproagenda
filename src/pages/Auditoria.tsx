import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Shield, Filter, Download, Eye, X } from 'lucide-react';
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
import { useAuditLogs, AuditLog } from '@/hooks/useAuditLogs';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { exportToCSV } from '@/lib/exportUtils';

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

  const handleExport = () => {
    exportToCSV({
      filename: 'audit_logs',
      headers: ['Data/Hora', 'Tabela', 'Ação', 'Usuário', 'ID do Registro'],
      rows: auditLogs.map(log => [
        format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
        tableNameMap[log.table_name] || log.table_name,
        actionMap[log.action]?.label || log.action,
        log.user_email || 'Sistema',
        log.record_id || '-',
      ]),
      successMessage: 'Logs exportados com sucesso!',
    });
  };

  const clearFilters = () => {
    setFilters({ tableName: '', action: '', startDate: '', endDate: '' });
  };

  return (
    <AppLayout title="Auditoria" subtitle="Logs de segurança e alterações">
      <div className="space-y-4 page-enter">
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
            
            <Button onClick={handleExport} variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
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

function getChangeSummary(log: AuditLog): string {
  const tableName = tableNameMap[log.table_name] || log.table_name;
  const actionLabel = actionMap[log.action]?.label || log.action;
  
  // Get identifier from data
  const data = log.new_data || log.old_data;
  const name = data?.name || data?.email || data?.description || '';
  
  if (log.action === 'INSERT') {
    return `${actionLabel} de ${tableName}${name ? `: "${name}"` : ''}`;
  }
  if (log.action === 'DELETE') {
    return `${actionLabel} de ${tableName}${name ? `: "${name}"` : ''}`;
  }
  if (log.action === 'UPDATE') {
    const changes: string[] = [];
    if (log.old_data && log.new_data) {
      for (const key of Object.keys(log.new_data)) {
        if (JSON.stringify(log.old_data[key]) !== JSON.stringify(log.new_data[key])) {
          const label = fieldLabels[key] || key;
          changes.push(label);
        }
      }
    }
    const changedFields = changes.length > 0 ? changes.slice(0, 3).join(', ') : '';
    const more = changes.length > 3 ? ` (+${changes.length - 3})` : '';
    return `${actionLabel} de ${tableName}${name ? ` "${name}"` : ''}${changedFields ? `: ${changedFields}${more}` : ''}`;
  }
  return `${actionLabel} em ${tableName}`;
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
