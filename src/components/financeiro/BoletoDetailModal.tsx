import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Check, X, Pencil, Calendar, DollarSign, FileText, User, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface BoletoDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All installments grouped by sale_id for a specific sale */
  installments: any[];
  sale: any;
  onMarkAsPaid: (params: { id: string; paidDate?: string }) => Promise<void>;
  onBatchPay: (params: { ids: string[]; paidDate?: string }) => Promise<void>;
  onUpdate: (params: { id: string; amount?: number; due_date?: string; notes?: string }) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

export function BoletoDetailModal({
  open,
  onOpenChange,
  installments,
  sale,
  onMarkAsPaid,
  onBatchPay,
  onUpdate,
  onCancel,
}: BoletoDetailModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ amount: '', due_date: '' });
  const [batchPaying, setBatchPaying] = useState(false);

  const sorted = useMemo(
    () => [...installments].sort((a, b) => a.installment_number - b.installment_number),
    [installments]
  );

  const pendingInstallments = sorted.filter(i => i.status === 'pending' || i.status === 'overdue');
  const paidInstallments = sorted.filter(i => i.status === 'paid');
  const totalAmount = sorted.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = paidInstallments.reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = pendingInstallments.reduce((s, i) => s + Number(i.amount), 0);
  const selectedTotal = selectedIds.reduce((s, id) => {
    const inst = sorted.find(i => i.id === id);
    return s + (inst ? Number(inst.amount) : 0);
  }, 0);

  const getStatusBadge = (inst: any) => {
    if (inst.status === 'paid') return <Badge className="bg-green-100 text-green-700 text-[10px]">Pago</Badge>;
    if (inst.status === 'cancelled') return <Badge variant="secondary" className="text-[10px]">Cancelado</Badge>;
    if (inst.status === 'overdue' || (inst.status === 'pending' && new Date(inst.due_date + 'T12:00:00') < new Date())) {
      return <Badge className="bg-red-100 text-red-700 text-[10px]">Atrasado</Badge>;
    }
    return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingInstallments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingInstallments.map(i => i.id));
    }
  };

  const startEdit = (inst: any) => {
    setEditingId(inst.id);
    setEditForm({
      amount: String(inst.amount),
      due_date: inst.due_date,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await onUpdate({
      id: editingId,
      amount: parseFloat(editForm.amount),
      due_date: editForm.due_date,
    });
    setEditingId(null);
  };

  const handleBatchPay = async () => {
    if (selectedIds.length === 0) return;
    // Validate: sum of paid + selected must not exceed total
    const wouldPayTotal = totalPaid + selectedTotal;
    if (wouldPayTotal > totalAmount + 0.01) {
      toast.error(`A soma das parcelas pagas (R$ ${wouldPayTotal.toFixed(2)}) ultrapassa o valor total (R$ ${totalAmount.toFixed(2)}). Verifique os valores.`);
      return;
    }
    setBatchPaying(true);
    try {
      await onBatchPay({ ids: selectedIds });
      setSelectedIds([]);
    } finally {
      setBatchPaying(false);
    }
  };

  const clientName = sale?.client?.name || 'Cliente';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Detalhes do Boleto Bancário
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] pr-2">
          <div className="space-y-4">
            {/* Sale & Client Info */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Cliente</span>
                  </div>
                  <p className="text-sm font-medium">{clientName}</p>
                  {sale?.client?.phone && (
                    <p className="text-xs text-muted-foreground">{sale.client.phone}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Resumo</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs">Total: <span className="font-medium">R$ {totalAmount.toFixed(2)}</span></p>
                    <p className="text-xs text-green-600">Pago: R$ {totalPaid.toFixed(2)}</p>
                    <p className="text-xs text-orange-600">Pendente: R$ {totalPending.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {sale?.description && (
              <p className="text-xs text-muted-foreground">
                <strong>Descrição:</strong> {sale.description}
              </p>
            )}

            <Separator />

            {/* Batch selection bar */}
            {pendingInstallments.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.length === pendingInstallments.length && pendingInstallments.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.length > 0
                      ? `${selectedIds.length} parcela(s) selecionada(s) — R$ ${selectedTotal.toFixed(2)}`
                      : 'Selecionar para baixa parcial'}
                  </span>
                </div>
                {selectedIds.length > 0 && (
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={handleBatchPay}
                    disabled={batchPaying}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {batchPaying ? 'Processando...' : `Pagar ${selectedIds.length} parcela(s)`}
                  </Button>
                )}
              </div>
            )}

            {/* Installments Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagto</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(inst => {
                  const isEditing = editingId === inst.id;
                  const isPending = inst.status === 'pending' || inst.status === 'overdue';

                  return (
                    <TableRow key={inst.id} className={selectedIds.includes(inst.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        {isPending && (
                          <Checkbox
                            checked={selectedIds.includes(inst.id)}
                            onCheckedChange={() => toggleSelect(inst.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {inst.installment_number}/{inst.total_installments}
                      </TableCell>
                      <TableCell className="text-sm">
                        {isEditing ? (
                          <Input
                            type="date"
                            value={editForm.due_date}
                            onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                            className="h-7 text-xs w-32"
                          />
                        ) : (
                          format(new Date(inst.due_date + 'T12:00:00'), 'dd/MM/yyyy')
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            className="h-7 text-xs w-24"
                          />
                        ) : (
                          `R$ ${Number(inst.amount).toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(inst)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inst.paid_date
                          ? format(new Date(inst.paid_date + 'T12:00:00'), 'dd/MM/yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}>
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : isPending ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(inst)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onMarkAsPaid({ id: inst.id })}
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onCancel(inst.id)}
                              >
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Payment History */}
            {paidInstallments.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Histórico de Pagamentos</h4>
                  <div className="space-y-1.5">
                    {paidInstallments.map(inst => (
                      <div key={inst.id} className="flex items-center justify-between text-xs p-2 rounded border bg-green-50 dark:bg-green-950/20">
                        <span>Parcela {inst.installment_number}/{inst.total_installments}</span>
                        <span>R$ {Number(inst.amount).toFixed(2)}</span>
                        <span className="text-muted-foreground">
                          Pago em {inst.paid_date ? format(new Date(inst.paid_date + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
