import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  payment: 'Baixa',
  batch_payment: 'Baixa em Lote',
  edit: 'Edição',
  cancel: 'Cancelamento',
  sync: 'Sincronização',
  create: 'Criação',
};

const EVENT_SOURCE_LABELS: Record<string, string> = {
  user: 'Usuário',
  webhook: 'Webhook',
  system: 'Sistema',
};

export function BoletoAuditLogDialog({ open, onOpenChange }: Props) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['boleto_audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boleto_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const getEventBadge = (eventType: string) => {
    const colors: Record<string, string> = {
      payment: 'bg-green-100 text-green-700',
      batch_payment: 'bg-green-100 text-green-700',
      edit: 'bg-blue-100 text-blue-700',
      cancel: 'bg-red-100 text-red-700',
      sync: 'bg-purple-100 text-purple-700',
      create: 'bg-gray-100 text-gray-700',
    };
    return (
      <Badge className={`${colors[eventType] || 'bg-gray-100 text-gray-700'} text-[10px]`}>
        {EVENT_TYPE_LABELS[eventType] || eventType}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Auditoria — Boletos
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell>
                </TableRow>
              ) : (
                logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{getEventBadge(log.event_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {EVENT_SOURCE_LABELS[log.event_source] || log.event_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.previous_status && log.new_status ? (
                        <span>{log.previous_status} → {log.new_status}</span>
                      ) : log.new_status || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.previous_amount != null && log.new_amount != null && log.previous_amount !== log.new_amount ? (
                        <span>R$ {Number(log.previous_amount).toFixed(2)} → R$ {Number(log.new_amount).toFixed(2)}</span>
                      ) : log.new_amount != null ? (
                        `R$ ${Number(log.new_amount).toFixed(2)}`
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
