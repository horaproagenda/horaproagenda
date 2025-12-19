import { useState, useMemo } from 'react';
import { format, parseISO, isAfter, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';

export function ContasAReceber() {
  const { receivables } = useFinancialEntries();

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Status</TableHead>
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
              </TableRow>
            ))}
            {pendingReceivables.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum valor a receber pendente
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
