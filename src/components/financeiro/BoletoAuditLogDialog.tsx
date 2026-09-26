import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResponsiveTable } from '@/components/ui/responsive-table';
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
      payment: 'bg-primary/10 text-primary',
      batch_payment: 'bg-primary/10 text-primary',
      edit: 'bg-accent/10 text-accent',
      cancel: 'bg-red-100 text-red-700',
      sync: 'bg-accent/10 text-accent',
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
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : (
            <ResponsiveTable
              data={logs as any[]}
              getRowKey={(log) => log.id}
              emptyMessage="Nenhum registro encontrado"
              columns={[
                {
                  key: 'event',
                  header: 'Evento',
                  priority: 'primary',
                  hideLabelOnCard: true,
                  cell: (log) => getEventBadge(log.event_type),
                },
                {
                  key: 'created_at',
                  header: 'Data',
                  priority: 'primary',
                  className: 'text-xs whitespace-nowrap',
                  cell: (log) => format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
                },
                {
                  key: 'source',
                  header: 'Origem',
                  priority: 'secondary',
                  cell: (log) => (
                    <Badge variant="outline" className="text-[10px]">
                      {EVENT_SOURCE_LABELS[log.event_source] || log.event_source}
                    </Badge>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  priority: 'secondary',
                  className: 'text-xs',
                  cell: (log) =>
                    log.previous_status && log.new_status ? (
                      <span>
                        {log.previous_status} → {log.new_status}
                      </span>
                    ) : (
                      log.new_status || '-'
                    ),
                },
                {
                  key: 'amount',
                  header: 'Valor',
                  priority: 'secondary',
                  className: 'text-xs',
                  cell: (log) =>
                    log.previous_amount != null &&
                    log.new_amount != null &&
                    log.previous_amount !== log.new_amount ? (
                      <span>
                        R$ {Number(log.previous_amount).toFixed(2)} → R$ {Number(log.new_amount).toFixed(2)}
                      </span>
                    ) : log.new_amount != null ? (
                      `R$ ${Number(log.new_amount).toFixed(2)}`
                    ) : (
                      '-'
                    ),
                },
                {
                  key: 'notes',
                  header: 'Detalhes',
                  priority: 'secondary',
                  className: 'text-xs text-muted-foreground max-w-[200px] truncate',
                  cell: (log) => log.notes || '-',
                },
              ]}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
