import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useFinancialAccounts, useFinancialMovements } from '@/hooks/useFinancialAccounts';

/**
 * Transferência entre a conta da clínica e a conta de um profissional.
 * O banco grava as duas pontas ligadas (saída na origem, entrada no destino).
 */
export function TransferBetweenAccountsDialog() {
  const { accounts } = useFinancialAccounts();
  const { transfer } = useFinancialMovements();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const canTransfer = accounts.length >= 2;
  const destinations = useMemo(() => accounts.filter((a) => a.id !== fromId), [accounts, fromId]);

  if (!canTransfer) return null;

  const handleSubmit = async () => {
    const value = Number(String(amount).replace(',', '.'));
    if (!fromId || !toId || fromId === toId) {
      toast.error('Escolha uma conta de origem e uma conta de destino diferentes.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Informe um valor maior que zero.');
      return;
    }
    await transfer.mutateAsync({
      from_account_id: fromId,
      to_account_id: toId,
      amount: value,
      description: description || null,
    });
    setOpen(false);
    setAmount('');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Transferir entre contas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>
            O valor sai de uma conta e entra na outra, com os dois registros ligados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Para</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder="Conta de destino" /></SelectTrigger>
              <SelectContent>
                {destinations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={transfer.isPending}>
            {transfer.isPending ? 'Transferindo...' : 'Confirmar transferência'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TransferBetweenAccountsDialog;
