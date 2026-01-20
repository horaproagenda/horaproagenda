import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  History,
  Clock,
  DollarSign,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  AlertTriangle,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { CashRegister, BankDeposit, useCashRegisters } from '@/hooks/useCashRegisters';
import { useBanks } from '@/hooks/useBanks';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<CashRegister | null>(null);
  
  // Edit form state
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editClosingBalance, setEditClosingBalance] = useState('');
  const [editCashAmount, setEditCashAmount] = useState('');
  const [editCheckAmount, setEditCheckAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const { updateCashRegister, deleteCashRegister } = useCashRegisters();
  const { banks } = useBanks();

  const filteredRegisters = useMemo(() => {
    if (!searchTerm) return closedRegisters;
    const search = searchTerm.toLowerCase();
    return closedRegisters.filter(register => {
      const dateMatch = format(parseISO(register.opened_at), 'dd/MM/yyyy').includes(search);
      const notesMatch = register.notes?.toLowerCase().includes(search);
      return dateMatch || notesMatch;
    });
  }, [closedRegisters, searchTerm]);

  const handleOpenEdit = (register: CashRegister) => {
    setSelectedRegister(register);
    setEditOpeningBalance(register.opening_balance.toString());
    setEditClosingBalance((register.closing_balance || 0).toString());
    setEditCashAmount((register.cash_amount || 0).toString());
    setEditCheckAmount((register.check_amount || 0).toString());
    setEditNotes(register.notes || '');
    setEditDialogOpen(true);
  };

  const handleOpenDelete = (register: CashRegister) => {
    setSelectedRegister(register);
    setDeleteDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedRegister) return;

    const openingBalance = parseFloat(editOpeningBalance) || 0;
    const closingBalance = parseFloat(editClosingBalance) || 0;
    const expectedBalance = openingBalance + (selectedRegister.total_received || 0);

    await updateCashRegister.mutateAsync({
      id: selectedRegister.id,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      expected_balance: expectedBalance,
      cash_amount: parseFloat(editCashAmount) || 0,
      check_amount: parseFloat(editCheckAmount) || 0,
      notes: editNotes || undefined,
    });

    setEditDialogOpen(false);
    setSelectedRegister(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedRegister) return;

    await deleteCashRegister.mutateAsync(selectedRegister.id);

    setDeleteDialogOpen(false);
    setSelectedRegister(null);
  };

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
    <>
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
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por data ou observações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          {filteredRegisters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{searchTerm ? 'Nenhum caixa encontrado' : 'Nenhum caixa fechado ainda'}</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <Accordion type="single" collapsible className="space-y-2">
                {filteredRegisters.map((register) => (
                  <AccordionItem
                    key={register.id}
                    value={register.id}
                    className="border rounded-lg px-4"
                  >
                    <div className="flex items-center">
                      <AccordionTrigger className="hover:no-underline py-3 flex-1">
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
                                {formatCurrency(Number(register.total_received || 0))}
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
                                {formatCurrency(Number(register.difference))}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      
                      {/* Action Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(register)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleOpenDelete(register)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
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
                              {formatCurrency(Number(register.opening_balance))}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <ArrowUp className="h-3 w-3 text-success" />
                              Recebido
                            </p>
                            <p className="font-semibold text-success">
                              {formatCurrency(Number(register.total_received || 0))}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                            <p className="font-semibold">
                              {formatCurrency(Number(register.expected_balance || 0))}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Saldo Final</p>
                            <p className="font-semibold">
                              {formatCurrency(Number(register.closing_balance || 0))}
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
                              {formatCurrency(Number(register.total_receivables || 0))}
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
                              {formatCurrency(Number(register.difference || 0))}
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
                                  {PAYMENT_LABELS[method] || method}: {formatCurrency(Number(amount))}
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Caixa</DialogTitle>
            <DialogDescription>
              Altere as informações do caixa fechado
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="opening_balance">Valor Inicial</Label>
                <Input
                  id="opening_balance"
                  type="number"
                  step="0.01"
                  value={editOpeningBalance}
                  onChange={(e) => setEditOpeningBalance(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing_balance">Saldo Final</Label>
                <Input
                  id="closing_balance"
                  type="number"
                  step="0.01"
                  value={editClosingBalance}
                  onChange={(e) => setEditClosingBalance(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cash_amount">Dinheiro em Caixa</Label>
                <Input
                  id="cash_amount"
                  type="number"
                  step="0.01"
                  value={editCashAmount}
                  onChange={(e) => setEditCashAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="check_amount">Cheques</Label>
                <Input
                  id="check_amount"
                  type="number"
                  step="0.01"
                  value={editCheckAmount}
                  onChange={(e) => setEditCheckAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateCashRegister.isPending}
            >
              {updateCashRegister.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Caixa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O caixa de{' '}
              <strong>
                {selectedRegister && format(parseISO(selectedRegister.opened_at), 'dd/MM/yyyy', { locale: ptBR })}
              </strong>{' '}
              e todas as suas transações serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCashRegister.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}