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
import { Pencil, Trash2, Check } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';

export function ContasAReceber() {
  const { receivables, updateEntry, deleteEntry } = useFinancialEntries();

  // Filter pending receivables
  const pendingReceivables = useMemo(() => {
    return receivables.filter(e => e.status === 'pending' || e.status === 'overdue');
  }, [receivables]);

  const getStatusBadge = (entry: any) => {
    if (entry.status === 'paid') {
      return <Badge className="bg-green-500 hover:bg-green-600">Recebido</Badge>;
    }
    const dueDate = parseISO(entry.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isAfter(today, dueDate)) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const handleMarkAsReceived = async (entry: any) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      status: 'paid' as const,
      paid_date: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  const totalPending = pendingReceivables.reduce((sum, e) => sum + Number(e.amount), 0);

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
                <TableHead>Valor</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingReceivables.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{format(parseISO(entry.due_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{entry.client?.name || '-'}</TableCell>
                  <TableCell className="text-green-600 font-medium">
                    R$ {Number(entry.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>{entry.installments || 1}x</TableCell>
                  <TableCell>{getStatusBadge(entry)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {entry.status === 'pending' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleMarkAsReceived(entry)} 
                          title="Marcar como recebido"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteEntry.mutate(entry.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {pendingReceivables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
