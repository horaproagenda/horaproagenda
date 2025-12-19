import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useProfessionals } from '@/hooks/useProfessionals';

export function MeusCaixas() {
  const { cashRegisters, isLoading } = useCashRegisters();
  const { professionals } = useProfessionals();

  const getProfessionalName = (openedBy: string | null) => {
    if (!openedBy) return '-';
    // Match by id since opened_by is a user id reference
    const professional = professionals.find(p => p.id === openedBy);
    return professional?.name || '-';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meus Caixas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meus Caixas</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Caixa</TableHead>
                <TableHead>Abertura</TableHead>
                <TableHead>Fechamento</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Valor Inicial</TableHead>
                <TableHead>Valor Fechamento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashRegisters.map((register, index) => (
                <TableRow key={register.id}>
                  <TableCell className="font-medium">#{cashRegisters.length - index}</TableCell>
                  <TableCell>
                    {format(parseISO(register.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    {register.closed_at 
                      ? format(parseISO(register.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : '-'
                    }
                  </TableCell>
                  <TableCell>{getProfessionalName(register.opened_by)}</TableCell>
                  <TableCell>R$ {Number(register.opening_balance).toFixed(2)}</TableCell>
                  <TableCell>
                    {register.closing_balance !== null 
                      ? `R$ ${Number(register.closing_balance).toFixed(2)}`
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant={register.status === 'open' ? 'default' : 'secondary'}>
                      {register.status === 'open' ? 'Aberto' : 'Fechado'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {cashRegisters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum caixa encontrado
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
