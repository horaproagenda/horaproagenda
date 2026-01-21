import { useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Banknote,
  Smartphone,
  FileText,
  Receipt,
  Printer,
  Download,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Clock,
} from 'lucide-react';
import { CashRegister } from '@/hooks/useCashRegisters';
import { useCashTransactions, CashTransaction } from '@/hooks/useCashTransactions';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface CashRegisterReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  register: CashRegister;
}

const PAYMENT_LABELS: Record<string, string> = {
  credit: 'Cartão de Crédito',
  debit: 'Cartão de Débito',
  pix: 'PIX',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  check: 'Cheque',
  other: 'Outros',
};

// Normalize text removing accents for PDF
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function CashRegisterReportDialog({
  open,
  onOpenChange,
  register,
}: CashRegisterReportDialogProps) {
  const { transactions } = useCashTransactions(register?.id);
  const printRef = useRef<HTMLDivElement>(null);

  // Calculate breakdown
  const breakdown = useMemo(() => {
    const result = {
      credit: 0,
      debit: 0,
      pix: 0,
      cash: 0,
      boleto: 0,
      check: 0,
      other: 0,
    };

    transactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const method = (t.payment_method || '').toLowerCase();
        const amount = Number(t.amount);

        if (method.includes('crédito') || method.includes('credito')) {
          result.credit += amount;
        } else if (method.includes('débito') || method.includes('debito')) {
          result.debit += amount;
        } else if (method.includes('pix')) {
          result.pix += amount;
        } else if (method.includes('dinheiro') || method.includes('espécie')) {
          result.cash += amount;
        } else if (method.includes('boleto')) {
          result.boleto += amount;
        } else if (method.includes('cheque')) {
          result.check += amount;
        } else {
          result.other += amount;
        }
      });

    return result;
  }, [transactions]);

  // Calculate totals
  const totals = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const salesCount = transactions.filter(t => t.type === 'income' && t.category === 'sale').length;

    return { income, expense, salesCount };
  }, [transactions]);

  const dateFormatted = format(parseISO(register.opened_at), 'dd/MM/yyyy', { locale: ptBR });
  const openTimeFormatted = format(parseISO(register.opened_at), 'HH:mm', { locale: ptBR });
  const closeTimeFormatted = register.closed_at
    ? format(parseISO(register.closed_at), 'HH:mm', { locale: ptBR })
    : '--:--';

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Não foi possível abrir a janela de impressão');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Caixa - ${dateFormatted}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .header h1 { font-size: 18px; margin-bottom: 5px; }
            .header p { color: #666; font-size: 11px; }
            .section { margin-bottom: 15px; }
            .section-title { font-weight: bold; margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
            .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #eee; }
            .row:last-child { border-bottom: none; }
            .label { color: #666; }
            .value { font-weight: 500; }
            .value.positive { color: #16a34a; }
            .value.negative { color: #dc2626; }
            .summary-box { background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .summary-row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #333; padding-top: 10px; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
            th, td { padding: 6px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; font-weight: 600; }
            td.amount { text-align: right; }
            .difference-box { text-align: center; padding: 12px; margin-top: 15px; border-radius: 4px; }
            .difference-box.ok { background: #dcfce7; color: #166534; }
            .difference-box.surplus { background: #dbeafe; color: #1e40af; }
            .difference-box.deficit { background: #fee2e2; color: #991b1b; }
            .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
            @media print {
              body { padding: 10px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Relatório de Fechamento de Caixa</h1>
            <p>Data: ${dateFormatted} | Abertura: ${openTimeFormatted} | Fechamento: ${closeTimeFormatted}</p>
          </div>

          <div class="section">
            <div class="section-title">Resumo do Caixa</div>
            <div class="summary-box">
              <div class="row">
                <span class="label">Saldo Inicial</span>
                <span class="value">${formatCurrency(Number(register.opening_balance))}</span>
              </div>
              <div class="row">
                <span class="label">Total Recebido</span>
                <span class="value positive">${formatCurrency(totals.income)}</span>
              </div>
              <div class="row">
                <span class="label">Total Saídas</span>
                <span class="value negative">${formatCurrency(totals.expense)}</span>
              </div>
              <div class="row">
                <span class="label">Saldo Esperado</span>
                <span class="value">${formatCurrency(Number(register.expected_balance || 0))}</span>
              </div>
              <div class="row">
                <span class="label">Saldo Final Contado</span>
                <span class="value">${formatCurrency(Number(register.closing_balance || 0))}</span>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Recebimentos por Forma de Pagamento</div>
            <table>
              <thead>
                <tr>
                  <th>Forma de Pagamento</th>
                  <th style="text-align: right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(breakdown)
                  .filter(([_, value]) => value > 0)
                  .map(([key, value]) => `
                    <tr>
                      <td>${PAYMENT_LABELS[key] || key}</td>
                      <td class="amount">${formatCurrency(value)}</td>
                    </tr>
                  `).join('')}
                <tr style="font-weight: bold; background: #f0f0f0;">
                  <td>Total</td>
                  <td class="amount">${formatCurrency(totals.income)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Transações do Dia (${transactions.length})</div>
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th style="text-align: right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.map(t => `
                  <tr>
                    <td>${format(parseISO(t.created_at), 'HH:mm')}</td>
                    <td>${t.description || t.category}</td>
                    <td>${t.type === 'income' ? 'Entrada' : 'Saída'}</td>
                    <td class="amount" style="color: ${t.type === 'income' ? '#16a34a' : '#dc2626'}">
                      ${t.type === 'income' ? '+' : '-'}${formatCurrency(Number(t.amount))}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="difference-box ${Number(register.difference || 0) === 0 ? 'ok' : Number(register.difference || 0) > 0 ? 'surplus' : 'deficit'}">
            <strong>Diferença: ${Number(register.difference || 0) >= 0 ? '+' : ''}${formatCurrency(Number(register.difference || 0))}</strong>
            ${Number(register.difference || 0) > 0 ? ' (sobra)' : Number(register.difference || 0) < 0 ? ' (falta)' : ' (conferido)'}
          </div>

          ${register.notes ? `
            <div class="section" style="margin-top: 15px;">
              <div class="section-title">Observações</div>
              <p>${register.notes}</p>
            </div>
          ` : ''}

          <div class="footer">
            Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 15;

      // Header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(normalizeText('Relatório de Fechamento de Caixa'), pageWidth / 2, y, { align: 'center' });
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(normalizeText(`Data: ${dateFormatted} | Abertura: ${openTimeFormatted} | Fechamento: ${closeTimeFormatted}`), pageWidth / 2, y, { align: 'center' });
      y += 12;

      // Summary
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(normalizeText('Resumo do Caixa'), 14, y);
      y += 8;

      const summaryData = [
        [normalizeText('Saldo Inicial'), formatCurrency(Number(register.opening_balance))],
        [normalizeText('Total Recebido'), formatCurrency(totals.income)],
        [normalizeText('Total Saídas'), formatCurrency(totals.expense)],
        [normalizeText('Saldo Esperado'), formatCurrency(Number(register.expected_balance || 0))],
        [normalizeText('Saldo Final Contado'), formatCurrency(Number(register.closing_balance || 0))],
        [normalizeText('Diferença'), `${Number(register.difference || 0) >= 0 ? '+' : ''}${formatCurrency(Number(register.difference || 0))}`],
      ];

      autoTable(doc, {
        startY: y,
        head: [],
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // Payment Breakdown
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(normalizeText('Recebimentos por Forma de Pagamento'), 14, y);
      y += 6;

      const breakdownData = Object.entries(breakdown)
        .filter(([_, value]) => value > 0)
        .map(([key, value]) => [normalizeText(PAYMENT_LABELS[key] || key), formatCurrency(value)]);

      if (breakdownData.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [[normalizeText('Forma de Pagamento'), 'Valor']],
          body: [...breakdownData, [normalizeText('Total'), formatCurrency(totals.income)]],
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [60, 60, 60], fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right' } },
          margin: { left: 14, right: 14 },
        });

        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // Transactions
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(normalizeText(`Transacoes do Dia (${transactions.length})`), 14, y);
      y += 6;

      const transactionData = transactions.map(t => [
        format(parseISO(t.created_at), 'HH:mm'),
        normalizeText(t.description || t.category || '-').substring(0, 40),
        normalizeText(t.type === 'income' ? 'Entrada' : 'Saida'),
        `${t.type === 'income' ? '+' : '-'}${formatCurrency(Number(t.amount))}`,
      ]);

      if (transactionData.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Hora', normalizeText('Descricao'), 'Tipo', 'Valor']],
          body: transactionData,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [60, 60, 60], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 80 },
            2: { cellWidth: 25 },
            3: { halign: 'right', cellWidth: 35 },
          },
          margin: { left: 14, right: 14 },
        });
      }

      // Notes
      if (register.notes) {
        y = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(normalizeText('Observacoes'), 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(normalizeText(register.notes), 14, y);
      }

      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(
        normalizeText(`Relatorio gerado em ${format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`),
        pageWidth / 2,
        footerY,
        { align: 'center' }
      );

      doc.save(`relatorio_caixa_${format(parseISO(register.opened_at), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    }
  };

  const PaymentRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color?: string }) => {
    if (value <= 0) return null;
    return (
      <div className="flex items-center justify-between py-1.5">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} />
          <span className="text-sm">{label}</span>
        </div>
        <span className="font-medium text-sm">{formatCurrency(value)}</span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Relatório de Caixa - {dateFormatted}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="default" size="sm" onClick={handleExportPDF}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div ref={printRef} className="space-y-4 pr-4">
            {/* Time Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>Abertura: {openTimeFormatted}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>Fechamento: {closeTimeFormatted}</span>
              </div>
              <Badge variant="secondary">{transactions.length} transações</Badge>
            </div>

            <Separator />

            {/* Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Saldo Inicial
                </p>
                <p className="font-semibold">{formatCurrency(Number(register.opening_balance))}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowUp className="h-3 w-3 text-green-600" />
                  Total Recebido
                </p>
                <p className="font-semibold text-green-600">{formatCurrency(totals.income)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowDown className="h-3 w-3 text-destructive" />
                  Total Saídas
                </p>
                <p className="font-semibold text-destructive">{formatCurrency(totals.expense)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                <p className="font-semibold">{formatCurrency(Number(register.expected_balance || 0))}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Saldo Contado</p>
                <p className="font-semibold">{formatCurrency(Number(register.closing_balance || 0))}</p>
              </div>
              <div className={`p-3 rounded-lg ${
                Number(register.difference || 0) === 0 ? 'bg-green-100 dark:bg-green-950' :
                Number(register.difference || 0) > 0 ? 'bg-blue-100 dark:bg-blue-950' :
                'bg-red-100 dark:bg-red-950'
              }`}>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {Number(register.difference || 0) >= 0 ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  Diferença
                </p>
                <p className={`font-semibold ${
                  Number(register.difference || 0) >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                }`}>
                  {Number(register.difference || 0) >= 0 ? '+' : ''}{formatCurrency(Number(register.difference || 0))}
                </p>
              </div>
            </div>

            <Separator />

            {/* Payment Breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Recebimentos por Forma de Pagamento</h4>
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <PaymentRow icon={CreditCard} label="Cartão de Crédito" value={breakdown.credit} color="text-purple-600" />
                <PaymentRow icon={CreditCard} label="Cartão de Débito" value={breakdown.debit} color="text-blue-600" />
                <PaymentRow icon={Smartphone} label="PIX" value={breakdown.pix} color="text-emerald-600" />
                <PaymentRow icon={Banknote} label="Dinheiro" value={breakdown.cash} color="text-green-600" />
                <PaymentRow icon={FileText} label="Boleto" value={breakdown.boleto} color="text-amber-600" />
                <PaymentRow icon={FileText} label="Cheque" value={breakdown.check} color="text-orange-600" />
                <PaymentRow icon={Receipt} label="Outros" value={breakdown.other} />
                
                <Separator className="my-2" />
                
                <div className="flex justify-between items-center py-1.5 font-semibold">
                  <span>Total</span>
                  <span className="text-green-600">{formatCurrency(totals.income)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Transactions List */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Transações ({transactions.length})</h4>
              <div className="space-y-1">
                {transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma transação registrada</p>
                ) : (
                  transactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-12">
                          {format(parseISO(t.created_at), 'HH:mm')}
                        </span>
                        <div>
                          <p className="text-sm">{t.description || t.category}</p>
                          {t.payment_method_name && (
                            <p className="text-xs text-muted-foreground">{t.payment_method_name}</p>
                          )}
                        </div>
                      </div>
                      <span className={`font-medium text-sm ${t.type === 'income' ? 'text-green-600' : 'text-destructive'}`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Notes */}
            {register.notes && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2">Observações</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">{register.notes}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
