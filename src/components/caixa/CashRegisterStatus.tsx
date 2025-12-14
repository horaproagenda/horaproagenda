import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LockOpen,
  Lock,
  DollarSign,
  Clock,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
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

interface CashRegisterStatusProps {
  currentRegister: CashRegister | undefined;
  totals: {
    total: number;
    count: number;
    byMethod: Record<string, number>;
  };
  totalReceivables: number;
  onOpenCashRegister: (openingBalance: number) => void;
  onCloseCashRegister: (params: {
    id: string;
    closingBalance: number;
    expectedBalance: number;
    totalReceived: number;
    totalReceivables: number;
    paymentsCount: number;
    paymentBreakdown: Record<string, number>;
    notes?: string;
  }) => void;
  isLoading: boolean;
}

export function CashRegisterStatus({
  currentRegister,
  totals,
  totalReceivables,
  onOpenCashRegister,
  onCloseCashRegister,
  isLoading,
}: CashRegisterStatusProps) {
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  const expectedBalance = currentRegister
    ? Number(currentRegister.opening_balance) + totals.total
    : 0;

  const handleOpenCashRegister = () => {
    const balance = parseFloat(openingBalance) || 0;
    onOpenCashRegister(balance);
    setOpeningBalance('');
    setShowOpenDialog(false);
  };

  const handleCloseCashRegister = () => {
    if (!currentRegister) return;
    
    const closing = parseFloat(closingBalance) || 0;
    
    onCloseCashRegister({
      id: currentRegister.id,
      closingBalance: closing,
      expectedBalance,
      totalReceived: totals.total,
      totalReceivables,
      paymentsCount: totals.count,
      paymentBreakdown: totals.byMethod,
      notes: notes || undefined,
    });
    
    setClosingBalance('');
    setNotes('');
    setShowCloseDialog(false);
  };

  const difference = closingBalance ? parseFloat(closingBalance) - expectedBalance : 0;

  return (
    <>
      <Card className={currentRegister ? 'border-success/50 bg-success/5' : 'border-warning/50 bg-warning/5'}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentRegister ? (
                <LockOpen className="h-5 w-5 text-success" />
              ) : (
                <Lock className="h-5 w-5 text-warning" />
              )}
              <CardTitle className="text-lg">
                {currentRegister ? 'Caixa Aberto' : 'Caixa Fechado'}
              </CardTitle>
            </div>
            <Badge variant={currentRegister ? 'default' : 'secondary'}>
              {currentRegister ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          {currentRegister && (
            <CardDescription>
              Aberto em {format(parseISO(currentRegister.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {currentRegister ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span>Valor Inicial</span>
                  </div>
                  <p className="text-xl font-bold">
                    R$ {Number(currentRegister.opening_balance).toFixed(2)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>Recebido Hoje</span>
                  </div>
                  <p className="text-xl font-bold text-success">
                    R$ {totals.total.toFixed(2)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span>A Receber</span>
                  </div>
                  <p className="text-xl font-bold text-warning">
                    R$ {totalReceivables.toFixed(2)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>Saldo Esperado</span>
                  </div>
                  <p className="text-xl font-bold text-primary">
                    R$ {expectedBalance.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Payment Breakdown */}
              {Object.keys(totals.byMethod).length > 0 && (
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-sm text-muted-foreground mb-2">Por Forma de Pagamento</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(totals.byMethod).map(([method, amount]) => (
                      <Badge key={method} variant="secondary" className="gap-1">
                        {PAYMENT_LABELS[method] || method}: R$ {Number(amount).toFixed(2)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => setShowCloseDialog(true)}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <Lock className="h-4 w-4" />
                  Fechar Caixa
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">
                Abra o caixa para começar a registrar movimentações
              </p>
              <Button
                onClick={() => setShowOpenDialog(true)}
                disabled={isLoading}
                className="gap-2"
              >
                <LockOpen className="h-4 w-4" />
                Abrir Caixa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Dialog */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5" />
              Abrir Caixa
            </DialogTitle>
            <DialogDescription>
              Informe o valor inicial do caixa para começar o dia
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor Inicial (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleOpenCashRegister}>
                Abrir Caixa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Fechar Caixa
            </DialogTitle>
            <DialogDescription>
              Confira os valores e informe o saldo final
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Valor Inicial:</span>
                <span className="font-medium">
                  R$ {Number(currentRegister?.opening_balance || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3 text-success" />
                  Recebimentos:
                </span>
                <span className="font-medium text-success">
                  R$ {totals.total.toFixed(2)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Saldo Esperado:</span>
                <span className="text-primary">R$ {expectedBalance.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Breakdown */}
            {Object.keys(totals.byMethod).length > 0 && (
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-sm font-medium mb-2">Detalhamento por Forma de Pagamento:</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(totals.byMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between">
                      <span className="text-muted-foreground">{PAYMENT_LABELS[method] || method}</span>
                      <span>R$ {Number(amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Saldo Final (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
              />
            </div>

            {closingBalance && (
              <div className={`p-3 rounded-lg ${difference >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferença:</span>
                  <span className={`text-lg font-bold ${difference >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {difference >= 0 ? '+' : ''} R$ {difference.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                placeholder="Adicione observações sobre o fechamento..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleCloseCashRegister}
                disabled={!closingBalance}
              >
                Confirmar Fechamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
