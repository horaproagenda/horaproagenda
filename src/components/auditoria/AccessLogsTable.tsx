import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Edit3, Trash2, Plus, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export interface AccessLog {
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

const moduleLabels: Record<string, string> = {
  agenda: 'Agenda',
  professional_sensitive: 'Dados sensíveis (profissional)',
};

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

export function AccessLogsTable() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['access_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_logs' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AccessLog[];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium tracking-wide">
          Logs de Acesso ({logs.length})
        </CardTitle>
        <CardDescription className="text-xs">
          Quem acessou áreas sensíveis e quais campos foram exibidos ou alterados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum acesso registrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Data/Hora</TableHead>
                  <TableHead className="text-[11px]">Usuário</TableHead>
                  <TableHead className="text-[11px]">Papel</TableHead>
                  <TableHead className="text-[11px]">Módulo</TableHead>
                  <TableHead className="text-[11px]">Ação</TableHead>
                  <TableHead className="text-[11px]">Campos exibidos</TableHead>
                  <TableHead className="text-[11px]">Campos alterados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const a = actionMap[log.action] ?? { label: log.action, icon: null, variant: 'outline' as const };
                  return (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs whitespace-nowrap py-2 tabular-nums">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-xs py-2 truncate max-w-[180px]">
                        {log.user_email || '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {log.user_role ? (roleLabels[log.user_role] ?? log.user_role) : '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {moduleLabels[log.module] ?? log.module}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant={a.variant} className="text-[10px] h-5 gap-1">
                          {a.icon}
                          {a.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] py-2 max-w-[260px]">
                        {log.fields_viewed && log.fields_viewed.length > 0
                          ? log.fields_viewed.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-[11px] py-2 max-w-[260px]">
                        {log.fields_changed && log.fields_changed.length > 0
                          ? log.fields_changed.join(', ')
                          : '—'}
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
  );
}
