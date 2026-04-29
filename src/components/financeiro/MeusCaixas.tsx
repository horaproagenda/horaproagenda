import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  LockOpen, 
  Lock, 
  Plus, 
  Trash2, 
  Building2,
  Banknote,
  Receipt,
  DollarSign,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';
import { useCashRegisters, BankDeposit } from '@/hooks/useCashRegisters';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useBanks } from '@/hooks/useBanks';
import { useCashTransactions } from '@/hooks/useCashTransactions';

export function MeusCaixas() {
  const { cashRegisters, currentOpenRegister, isLoading, openCashRegister, closeCashRegister } = useCashRegisters();
  const { professionals } = useProfessionals();
  const { activeBanks } = useBanks();
  const { transactions } = useCashTransactions(currentOpenRegister?.id);

  // Dialog states
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  
  // Form states
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [bankDeposits, setBankDeposits] = useState<BankDeposit[]>([]);
  const [notes, setNotes] = useState('');

  const getProfessionalName = (openedBy: string | null) => {
    if (!openedBy) return '-';
    const professional = professionals.find(p => p.id === openedBy);
    return professional?.name || '-';
  };

  // Calculate totals from transactions
  const incomeTotal = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const expenseTotal = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expectedBalance = currentOpenRegister
    ? Number(currentOpenRegister.opening_balance) + incomeTotal - expenseTotal
    : 0;

  const handleOpenCashRegister = () => {
    const balance = parseFloat(openingBalance) || 0;
    openCashRegister.mutate(balance, {
      onSuccess: () => {
        setOpeningBalance('');
        setShowOpenDialog(false);
      },
    });
  };

  const handleCloseCashRegister = () => {
    if (!currentOpenRegister) return;

    const closing = parseFloat(closingBalance) || 0;
    
    // Payment breakdown from transactions
    const paymentBreakdown: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const method = t.payment_method || 'outros';
        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + Number(t.amount);
      });

    closeCashRegister.mutate({
      id: currentOpenRegister.id,
      closingBalance: closing,
      expectedBalance,
      totalReceived: incomeTotal,
      totalReceivables: 0,
      paymentsCount: transactions.filter(t => t.type === 'income').length,
      paymentBreakdown,
      notes: notes || undefined,
      cashAmount: parseFloat(cashAmount) || 0,
      checkAmount: parseFloat(checkAmount) || 0,
      bankDeposits,
    }, {
      onSuccess: () => {
        setClosingBalance('');
        setCashAmount('');
        setCheckAmount('');
        setBankDeposits([]);
        setNotes('');
        setShowCloseDialog(false);
      },
    });
  };

  const addBankDeposit = () => {
    setBankDeposits([...bankDeposits, { bank_id: '', bank_name: '', amount: 0 }]);
  };

  const updateBankDeposit = (index: number, field: keyof BankDeposit, value: string | number) => {
    const updated = [...bankDeposits];
    if (field === 'bank_id') {
      const bank = activeBanks.find(b => b.id === value);
      updated[index] = { ...updated[index], bank_id: value as string, bank_name: bank?.name || '' };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setBankDeposits(updated);
  };

  const removeBankDeposit = (index: number) => {
    setBankDeposits(bankDeposits.filter((_, i) => i !== index));
  };

  const difference = closingBalance ? parseFloat(closingBalance) - expectedBalance : 0;
  const totalBankDeposits = bankDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalDistributed = (parseFloat(cashAmount) || 0) + (parseFloat(checkAmount) || 0) + totalBankDeposits;

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
    <div className="space-y-4">
      {/* Cash Register Status Card */}
      <Card className={currentOpenRegister ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20'}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentOpenRegister ? (
                <LockOpen className="h-5 w-5 text-green-600" />
              ) : (
                <Lock className="h-5 w-5 text-amber-600" />
              )}
              <CardTitle className="text-lg">
                {currentOpenRegister ? 'Caixa Aberto' : 'Caixa Fechado'}
              </CardTitle>
            </div>
            <Badge variant={currentOpenRegister ? 'default' : 'secondary'}>
              {currentOpenRegister ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentOpenRegister ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span>Saldo Inicial</span>
                  </div>
                  <p className="text-xl font-bold">
                    R$ {Number(currentOpenRegister.opening_balance).toFixed(2)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>Recebido</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    R$ {incomeTotal.toFixed(2)}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <TrendingUp className="h-4 w-4 rotate-180" />
                    <span>Saídas</span>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    R$ {expenseTotal.toFixed(2)}
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

              <p className="text-sm text-muted-foreground">
                Aberto em {format(parseISO(currentOpenRegister.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>

              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => setShowCloseDialog(true)}
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
                className="gap-2"
              >
                <LockOpen className="h-4 w-4" />
                Abrir Caixa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cash Register History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Caixas</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Caixa</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Saldo Inicial</TableHead>
                  <TableHead>Saldo Final</TableHead>
                  <TableHead>Banco Destino</TableHead>
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
                      {register.bank_deposits && register.bank_deposits.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {register.bank_deposits.map((dep, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {dep.bank_name}: R$ {Number(dep.amount).toFixed(2)}
                            </Badge>
                          ))}
                        </div>
                      ) : '-'}
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum caixa encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
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
              Informe o saldo inicial para começar o dia
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <CurrencyInput
                placeholder="0,00"
                value={openingBalance}
                onValueChange={(value) => setOpeningBalance(String(value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleOpenCashRegister} disabled={openCashRegister.isPending}>
              Abrir Caixa
            </Button>
          </DialogFooter>
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
                <span>Saldo Inicial:</span>
                <span className="font-medium">
                  R$ {Number(currentOpenRegister?.opening_balance || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-600">+ Entradas:</span>
                <span className="font-medium text-green-600">
                  R$ {incomeTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-red-600">- Saídas:</span>
                <span className="font-medium text-red-600">
                  R$ {expenseTotal.toFixed(2)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Saldo Esperado:</span>
                <span className="text-primary">R$ {expectedBalance.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Saldo Final (R$) *</Label>
              <CurrencyInput
                placeholder="0,00"
                value={closingBalance}
                onValueChange={(value) => setClosingBalance(String(value))}
              />
            </div>

            {closingBalance && (
              <div className={`p-3 rounded-lg ${difference >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferença:</span>
                  <span className={`text-lg font-bold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {difference >= 0 ? '+' : ''} R$ {difference.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <Separator />

            {/* Distribution Section */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Distribuição do Fechamento</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    Dinheiro (R$)
                  </Label>
                  <CurrencyInput
                    placeholder="0,00"
                    value={cashAmount}
                    onValueChange={(value) => setCashAmount(String(value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    Cheques (R$)
                  </Label>
                  <CurrencyInput
                    placeholder="0,00"
                    value={checkAmount}
                    onValueChange={(value) => setCheckAmount(String(value))}
                  />
                </div>
              </div>

              {/* Bank Deposits */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Depósitos Bancários
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={addBankDeposit}>
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                
                {bankDeposits.map((deposit, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={deposit.bank_id}
                      onValueChange={(value) => updateBankDeposit(index, 'bank_id', value)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione o banco" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBanks.map(bank => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <CurrencyInput
                      placeholder="Valor"
                      className="w-24"
                      value={deposit.amount || ''}
                      onValueChange={(value) => updateBankDeposit(index, 'amount', value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBankDeposit(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Distribution Summary */}
              <div className="p-2 rounded bg-muted/50 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Total distribuído:</span>
                  <span className="font-medium">R$ {totalDistributed.toFixed(2)}</span>
                </div>
                {closingBalance && (
                  <div className="flex justify-between">
                    <span>Falta distribuir:</span>
                    <span className={`font-medium ${(parseFloat(closingBalance) - totalDistributed) !== 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      R$ {(parseFloat(closingBalance) - totalDistributed).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCloseCashRegister} 
              disabled={closeCashRegister.isPending || !closingBalance}
              variant="destructive"
            >
              Fechar Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
