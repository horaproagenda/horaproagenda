import { useState, useMemo } from 'react';
import { format, parseISO, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil, Trash2, Check, Calendar } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useAppointments } from '@/hooks/useAppointments';

export function ContasAReceber() {
  const { receivables, updateEntry, deleteEntry } = useFinancialEntries();
  const { appointments } = useAppointments();

  // Combine financial entries with pending appointments
  const allReceivables = useMemo(() => {
    // Get pending financial entries
    const pendingFinancialEntries = receivables
      .filter(e => e.status === 'pending' || e.status === 'overdue')
      .map(e => ({
        id: e.id,
        type: 'financial_entry' as const,
        date: e.due_date,
        description: e.description,
        clientName: e.client?.name || '-',
        amount: Number(e.amount),
        installments: e.installments || 1,
        status: e.status,
        originalEntry: e,
      }));

    // Get appointments with pending payment
    const pendingAppointments = appointments
      .filter(apt => apt.payment_status === 'pending' && apt.status !== 'cancelled')
      .map(apt => ({
        id: apt.id,
        type: 'appointment' as const,
        date: apt.start_time.split('T')[0],
        description: apt.service?.name || apt.package_appointment?.package?.name || 'Agendamento',
        clientName: apt.client?.name || '-',
        amount: apt.service?.price || apt.package_appointment?.package?.total_price || 0,
        installments: 1,
        status: isAfter(new Date(), parseISO(apt.start_time)) ? 'overdue' : 'pending',
        originalAppointment: apt,
      }));

    return [...pendingFinancialEntries, ...pendingAppointments].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [receivables, appointments]);

  const getStatusBadge = (item: typeof allReceivables[0]) => {
    if (item.status === 'paid') {
      return <Badge className="bg-green-500 hover:bg-green-600">Recebido</Badge>;
    }
    const dueDate = parseISO(item.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isAfter(today, dueDate)) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const getTypeBadge = (type: 'financial_entry' | 'appointment') => {
    if (type === 'appointment') {
      return <Badge variant="outline" className="text-blue-600 border-blue-300"><Calendar className="h-3 w-3 mr-1" />Agendamento</Badge>;
    }
    return null;
  };

  const handleMarkAsReceived = async (item: typeof allReceivables[0]) => {
    if (item.type === 'financial_entry' && item.originalEntry) {
      await updateEntry.mutateAsync({
        id: item.id,
        status: 'paid' as const,
        paid_date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
    // For appointments, user should use the payment flow in Agenda
  };

  const handleDelete = async (item: typeof allReceivables[0]) => {
    if (item.type === 'financial_entry') {
      await deleteEntry.mutate(item.id);
    }
  };

  const totalPending = allReceivables.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>A Receber</CardTitle>
        <div className="text-lg font-bold text-green-600">
          Total: R$ {totalPending.toFixed(2)}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allReceivables.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell>{format(parseISO(item.date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.clientName}</TableCell>
                  <TableCell>{getTypeBadge(item.type)}</TableCell>
                  <TableCell className="text-green-600 font-medium">
                    R$ {item.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>{item.installments}x</TableCell>
                  <TableCell>{getStatusBadge(item)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {item.type === 'financial_entry' && item.status === 'pending' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleMarkAsReceived(item)} 
                          title="Marcar como recebido"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {item.type === 'appointment' && (
                        <span className="text-xs text-muted-foreground px-2">
                          Pagar na Agenda
                        </span>
                      )}
                      {item.type === 'financial_entry' && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allReceivables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum valor a receber pendente
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
