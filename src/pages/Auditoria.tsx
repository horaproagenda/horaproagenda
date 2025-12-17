import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Shield, Filter, Download, Eye } from 'lucide-react';
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
import { useAuditLogs, AuditLog } from '@/hooks/useAuditLogs';

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
  const [filters, setFilters] = useState({
    tableName: '',
    action: '',
    startDate: '',
    endDate: '',
  });

  const { auditLogs, isLoading } = useAuditLogs({
    tableName: filters.tableName || undefined,
    action: filters.action || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const exportToCSV = () => {
    const headers = ['Data/Hora', 'Tabela', 'Ação', 'Usuário', 'ID do Registro'];
    const rows = auditLogs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
      tableNameMap[log.table_name] || log.table_name,
      actionMap[log.action]?.label || log.action,
      log.user_email || 'Sistema',
      log.record_id || '-',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <AppLayout title="Auditoria" subtitle="Logs de segurança e alterações">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Logs de Auditoria
            </h1>
            <p className="text-muted-foreground">
              Acompanhe todas as alterações realizadas no sistema
            </p>
          </div>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tabela</Label>
              <Select
                  value={filters.tableName || "all"}
                  onValueChange={(value) => setFilters({ ...filters, tableName: value === "all" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as tabelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as tabelas</SelectItem>
                    {Object.entries(tableNameMap).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select
                  value={filters.action || "all"}
                  onValueChange={(value) => setFilters({ ...filters, action: value === "all" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as ações" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as ações</SelectItem>
                    <SelectItem value="INSERT">Criação</SelectItem>
                    <SelectItem value="UPDATE">Edição</SelectItem>
                    <SelectItem value="DELETE">Exclusão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registros ({auditLogs.length})</CardTitle>
            <CardDescription>Últimas alterações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum registro encontrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {tableNameMap[log.table_name] || log.table_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionMap[log.action]?.variant || 'default'}>
                          {actionMap[log.action]?.label || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.user_email || 'Sistema'}</TableCell>
                      <TableCell>
                        <AuditDetailDialog log={log} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes da Alteração</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Tabela</Label>
              <p className="font-medium">{tableNameMap[log.table_name] || log.table_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Ação</Label>
              <p className="font-medium">{actionMap[log.action]?.label || log.action}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Usuário</Label>
              <p className="font-medium">{log.user_email || 'Sistema'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Data/Hora</Label>
              <p className="font-medium">
                {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              </p>
            </div>
          </div>

          {log.old_data && (
            <div>
              <Label className="text-muted-foreground">Dados Anteriores</Label>
              <ScrollArea className="h-40 mt-2">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(log.old_data, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {log.new_data && (
            <div>
              <Label className="text-muted-foreground">Dados Novos</Label>
              <ScrollArea className="h-40 mt-2">
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
