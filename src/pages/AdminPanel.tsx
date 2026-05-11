import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Filter, X, Eye, Edit3, Plus, Trash2, FileDown, RefreshCw, Search, Users } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import UserManagement from '@/components/settings/UserManagement';
import { ManageProfessionalsDialog } from '@/components/services/ManageProfessionalsDialog';
import { useProfessionals } from '@/hooks/useProfessionals';
import { exportToCSV } from '@/lib/exportUtils';
import {
  moduleLabels,
  labelField,
  describeTarget,
  summarizeLog,
} from '@/lib/accessLogLabels';

interface AccessLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  module: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  fields_viewed: string[] | null;
  fields_changed: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const actionMap: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  view: { label: 'Visualização', icon: <Eye className="h-3 w-3" />, variant: 'outline' },
  edit: { label: 'Edição', icon: <Edit3 className="h-3 w-3" />, variant: 'secondary' },
  create: { label: 'Criação', icon: <Plus className="h-3 w-3" />, variant: 'default' },
  delete: { label: 'Exclusão', icon: <Trash2 className="h-3 w-3" />, variant: 'destructive' },
  export: { label: 'Exportação', icon: <FileDown className="h-3 w-3" />, variant: 'outline' },
  open: { label: 'Acesso', icon: <Eye className="h-3 w-3" />, variant: 'outline' },
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  professional: 'Profissional',
};

export default function AdminPanel() {
  const { hasRole, loading } = useAuth();
  const queryClient = useQueryClient();
  const { professionals } = useProfessionals();

  // Mapas user_id -> nome e email -> nome (fallback)
  const professionalByUserId = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach(p => {
      const uid = (p as unknown as { user_id?: string | null }).user_id;
      if (uid) map.set(uid, p.name);
    });
    return map;
  }, [professionals]);

  const professionalByEmail = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach(p => {
      if (p.email) map.set(p.email.toLowerCase(), p.name);
    });
    return map;
  }, [professionals]);

  const resolveUserName = (log: AccessLog): string => {
    if (log.user_id && professionalByUserId.has(log.user_id)) {
      return professionalByUserId.get(log.user_id)!;
    }
    if (log.user_email && professionalByEmail.has(log.user_email.toLowerCase())) {
      return professionalByEmail.get(log.user_email.toLowerCase())!;
    }
    return log.user_email || '—';
  };

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    user: '',
    module: 'all',
    action: 'all',
    field: '',
    startDate: '',
    endDate: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailLog, setDetailLog] = useState<AccessLog | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['admin_access_logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('access_logs' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (filters.module !== 'all') query = query.eq('module', filters.module);
      if (filters.action !== 'all') query = query.eq('action', filters.action);
      if (filters.user) query = query.ilike('user_email', `%${filters.user}%`);
      if (filters.startDate) query = query.gte('created_at', `${filters.startDate}T00:00:00`);
      if (filters.endDate) query = query.lte('created_at', `${filters.endDate}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AccessLog[];
    },
    enabled: hasRole('admin'),
    staleTime: 0,
  });

  useEffect(() => {
    if (!hasRole('admin')) return;
    const channel = supabase
      .channel('admin-access-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin_access_logs'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasRole, queryClient]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fieldTerm = filters.field.trim().toLowerCase();
    return logs.filter(log => {
      if (term) {
        const haystack = [
          resolveUserName(log),
          log.user_email, log.user_role, log.module, log.action,
          log.target_type, log.target_id,
          ...(log.fields_viewed ?? []),
          ...(log.fields_changed ?? []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (fieldTerm) {
        const fields = [...(log.fields_viewed ?? []), ...(log.fields_changed ?? [])]
          .map(f => f.toLowerCase());
        if (!fields.some(f => f.includes(fieldTerm))) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, search, filters.field, professionalByUserId, professionalByEmail]);

  const activeFiltersCount =
    (filters.user ? 1 : 0) +
    (filters.module !== 'all' ? 1 : 0) +
    (filters.action !== 'all' ? 1 : 0) +
    (filters.field ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0);

  const clearFilters = () => setFilters({ user: '', module: 'all', action: 'all', field: '', startDate: '', endDate: '' });

  const handleExport = () => {
    exportToCSV({
      filename: 'logs_de_acesso',
      headers: ['Data/Hora', 'Profissional', 'Papel', 'Módulo', 'Ação', 'Alvo', 'Resumo', 'Campos exibidos', 'Campos alterados'],
      rows: filteredLogs.map(log => [
        format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
        resolveUserName(log),
        log.user_role ? (roleLabels[log.user_role] ?? log.user_role) : '-',
        moduleLabels[log.module] ?? log.module,
        actionMap[log.action]?.label ?? log.action,
        describeTarget(log),
        summarizeLog(log),
        (log.fields_viewed ?? []).map(labelField).join(', '),
        (log.fields_changed ?? []).map(labelField).join(', '),
      ]),
      successMessage: 'Logs exportados!',
    });
  };

  if (loading) return null;
  if (!hasRole('admin')) return <Navigate to="/" replace />;

  return (
    <AppLayout title="Painel do Administrador" subtitle="Logs de acesso e gestão restrita">
      <div className="space-y-4 page-enter">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-wide">Painel do Administrador</h1>
        </div>

        <Tabs defaultValue="access" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="access" className="text-xs">Logs de Acesso</TabsTrigger>
            <TabsTrigger value="users" className="text-xs">Usuários e Permissões</TabsTrigger>
            <TabsTrigger value="professionals" className="text-xs">Profissionais</TabsTrigger>
          </TabsList>

          <TabsContent value="access" className="mt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar profissional, módulo, alvo, campo..."
                  className="h-8 pl-7 text-xs"
                />
              </div>

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
                <PopoverContent align="end" className="w-80 p-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Filtros</p>
                      {activeFiltersCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>Limpar</Button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Usuário (e-mail)</Label>
                      <Input value={filters.user} onChange={e => setFilters(p => ({ ...p, user: e.target.value }))} className="h-8 text-xs" placeholder="ex.: maria@..." />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Módulo</Label>
                      <Select value={filters.module} onValueChange={(v) => setFilters(p => ({ ...p, module: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Object.entries(moduleLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Ação</Label>
                      <Select value={filters.action} onValueChange={(v) => setFilters(p => ({ ...p, action: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {Object.entries(actionMap).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Campo (visualizado/alterado)</Label>
                      <Input value={filters.field} onChange={e => setFilters(p => ({ ...p, field: e.target.value }))} className="h-8 text-xs" placeholder="ex.: cpf, status, price" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">De</Label>
                        <Input type="date" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Até</Label>
                        <Input type="date" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} className="h-8 text-xs" />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExport}>
                <FileDown className="h-3.5 w-3.5" /> Exportar CSV
              </Button>
            </div>

            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {filters.user && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">Usuário: {filters.user}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(p => ({ ...p, user: '' }))} />
                  </Badge>
                )}
                {filters.module !== 'all' && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">Módulo: {moduleLabels[filters.module] ?? filters.module}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(p => ({ ...p, module: 'all' }))} />
                  </Badge>
                )}
                {filters.action !== 'all' && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">Ação: {actionMap[filters.action]?.label ?? filters.action}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(p => ({ ...p, action: 'all' }))} />
                  </Badge>
                )}
                {filters.field && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">Campo: {filters.field}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(p => ({ ...p, field: '' }))} />
                  </Badge>
                )}
                {(filters.startDate || filters.endDate) && (
                  <Badge variant="secondary" className="h-5 text-[10px] gap-1">
                    {filters.startDate || '...'} → {filters.endDate || '...'}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilters(p => ({ ...p, startDate: '', endDate: '' }))} />
                  </Badge>
                )}
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium tracking-wide">
                  Registros ({filteredLogs.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Sincronizado em tempo real. Mostra quem acessou, sobre qual registro (alvo) e — em "Visualizar ação" — o resumo do que foi exibido ou alterado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhum registro encontrado.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px]">Data/Hora</TableHead>
                          <TableHead className="text-[11px]">Profissional</TableHead>
                          <TableHead className="text-[11px]">Papel</TableHead>
                          <TableHead className="text-[11px]">Módulo</TableHead>
                          <TableHead className="text-[11px]">Ação</TableHead>
                          <TableHead className="text-[11px]">Alvo</TableHead>
                          <TableHead className="text-[11px]">Detalhes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map((log) => {
                          const a = actionMap[log.action] ?? { label: log.action, icon: null, variant: 'outline' as const };
                          return (
                            <TableRow key={log.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs whitespace-nowrap py-2 tabular-nums">
                                {format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss', { locale: ptBR })}
                              </TableCell>
                              <TableCell className="text-xs py-2 truncate max-w-[200px]">{resolveUserName(log)}</TableCell>
                              <TableCell className="text-xs py-2">{log.user_role ? (roleLabels[log.user_role] ?? log.user_role) : '—'}</TableCell>
                              <TableCell className="text-xs py-2">{moduleLabels[log.module] ?? log.module}</TableCell>
                              <TableCell className="py-2">
                                <Badge variant={a.variant} className="text-[10px] h-5 gap-1">{a.icon}{a.label}</Badge>
                              </TableCell>
                              <TableCell className="text-[11px] py-2 truncate max-w-[220px]">
                                {describeTarget(log)}
                              </TableCell>
                              <TableCell className="py-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => setDetailLog(log)}
                                >
                                  <Eye className="h-3 w-3" /> Visualizar ação
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UserManagement />
          </TabsContent>

          <TabsContent value="professionals" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5" /> Profissionais
                </CardTitle>
                <CardDescription className="text-xs">
                  Cadastro, edição e gestão de profissionais. Apenas administradores têm acesso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 mb-4">
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{professionals.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total cadastrados</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {professionals.filter(p => p.is_active).length} ativos
                  </Badge>
                </div>
                <ManageProfessionalsDialog>
                  <button className="w-full py-2.5 px-4 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-all duration-300 text-sm font-medium tracking-wide">
                    Gerenciar Profissionais
                  </button>
                </ManageProfessionalsDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Diálogo "Visualizar ação" */}
        <Dialog open={!!detailLog} onOpenChange={(o) => !o && setDetailLog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">Detalhes da ação</DialogTitle>
              <DialogDescription className="text-xs">
                Resumo legível do que foi visualizado ou alterado neste registro.
              </DialogDescription>
            </DialogHeader>
            {detailLog && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="col-span-1 text-muted-foreground">Quando</div>
                  <div className="col-span-2 tabular-nums">
                    {format(new Date(detailLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                  </div>
                  <div className="col-span-1 text-muted-foreground">Profissional</div>
                  <div className="col-span-2">{resolveUserName(detailLog)}</div>
                  <div className="col-span-1 text-muted-foreground">Papel</div>
                  <div className="col-span-2">
                    {detailLog.user_role ? (roleLabels[detailLog.user_role] ?? detailLog.user_role) : '—'}
                  </div>
                  <div className="col-span-1 text-muted-foreground">Módulo</div>
                  <div className="col-span-2">{moduleLabels[detailLog.module] ?? detailLog.module}</div>
                  <div className="col-span-1 text-muted-foreground">Ação</div>
                  <div className="col-span-2">
                    <Badge variant={actionMap[detailLog.action]?.variant ?? 'outline'} className="text-[10px] h-5">
                      {actionMap[detailLog.action]?.label ?? detailLog.action}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-muted-foreground">Alvo</div>
                  <div className="col-span-2">{describeTarget(detailLog)}</div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-1">Resumo</p>
                  <p className="text-sm leading-relaxed">{summarizeLog(detailLog)}</p>
                </div>

                {detailLog.fields_viewed && detailLog.fields_viewed.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Campos exibidos</p>
                    <div className="flex flex-wrap gap-1">
                      {detailLog.fields_viewed.map((f) => (
                        <Badge key={`v-${f}`} variant="outline" className="text-[10px] h-5">
                          {labelField(f)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {detailLog.fields_changed && detailLog.fields_changed.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Campos alterados</p>
                    <div className="flex flex-wrap gap-1">
                      {detailLog.fields_changed.map((f) => (
                        <Badge key={`c-${f}`} variant="secondary" className="text-[10px] h-5">
                          {labelField(f)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
