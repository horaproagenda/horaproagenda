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

function AuditDetailDialog({ log }: { log: AuditLog }) {
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Tabela</Label>
              <p className="font-medium text-sm">{tableNameMap[log.table_name] || log.table_name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ação</Label>
              <p className="font-medium text-sm">{actionMap[log.action]?.label || log.action}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Usuário</Label>
              <p className="font-medium text-sm">{log.user_email || 'Sistema'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data/Hora</Label>
              <p className="font-medium text-sm">
                {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              </p>
            </div>
          </div>

          {log.old_data && (
            <div>
              <Label className="text-xs text-muted-foreground">Dados Anteriores</Label>
              <ScrollArea className="h-32 mt-2">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(log.old_data, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {log.new_data && (
            <div>
              <Label className="text-xs text-muted-foreground">Dados Novos</Label>
              <ScrollArea className="h-32 mt-2">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(log.new_data, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
