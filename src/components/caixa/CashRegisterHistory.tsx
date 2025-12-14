import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  History,
  Clock,
  DollarSign,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { CashRegister } from '@/hooks/useCashRegisters';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência',
  installments: 'Parcelado',
};

interface CashRegisterHistoryProps {
  closedRegisters: CashRegister[];
  isLoading: boolean;
}

export function CashRegisterHistory({ closedRegisters, isLoading }: CashRegisterHistoryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Caixas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Caixas
        </CardTitle>
        <CardDescription>
          Visualize os caixas anteriores com todas as informações
        </CardDescription>
      </CardHeader>
      <CardContent>
        {closedRegisters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum caixa fechado ainda</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <Accordion type="single" collapsible className="space-y-2">
              {closedRegisters.map((register, index) => (
                <AccordionItem
                  key={register.id}
                  value={register.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">
                            {format(parseISO(register.opened_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(register.opened_at), 'HH:mm', { locale: ptBR })} - {' '}
                            {register.closed_at
                              ? format(parseISO(register.closed_at), 'HH:mm', { locale: ptBR })
                              : '--:--'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Recebido</p>
                          <p className="font-bold text-success">
                            R$ {Number(register.total_received || 0).toFixed(2)}
                          </p>
                        </div>
                        {register.difference !== null && (
                          <Badge
                            variant={Number(register.difference) >= 0 ? 'default' : 'destructive'}
                            className="gap-1"
                          >
                            {Number(register.difference) >= 0 ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            {Number(register.difference) >= 0 ? '+' : ''}
                            R$ {Number(register.difference).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-4 pt-2">
                      {/* Summary Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Valor Inicial
                          </p>
                          <p className="font-semibold">
                            R$ {Number(register.opening_balance).toFixed(2)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUp className="h-3 w-3 text-success" />
                            Recebido
                          </p>
                          <p className="font-semibold text-success">
                            R$ {Number(register.total_received || 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                          <p className="font-semibold">
                            R$ {Number(register.expected_balance || 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Saldo Final</p>
                          <p className="font-semibold">
                            R$ {Number(register.closing_balance || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Additional Info */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground">Pagamentos</p>
                          <p className="font-semibold">{register.payments_count || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground">A Receber (na época)</p>
                          <p className="font-semibold text-warning">
                            R$ {Number(register.total_receivables || 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {Number(register.difference || 0) >= 0 ? (
                              <ArrowUp className="h-3 w-3 text-success" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-destructive" />
                            )}
                            Diferença
                          </p>
                          <p className={`font-semibold ${Number(register.difference || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {Number(register.difference || 0) >= 0 ? '+' : ''}
                            R$ {Number(register.difference || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Payment Breakdown */}
                      {register.payment_breakdown && Object.keys(register.payment_breakdown).length > 0 && (
                        <div className="p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground mb-2">Por Forma de Pagamento</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(register.payment_breakdown).map(([method, amount]) => (
                              <Badge key={method} variant="outline" className="text-xs">
                                {PAYMENT_LABELS[method] || method}: R$ {Number(amount).toFixed(2)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {register.notes && (
                        <div className="p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground mb-1">Observações</p>
                          <p className="text-sm">{register.notes}</p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
