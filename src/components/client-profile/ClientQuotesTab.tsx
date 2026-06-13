import { useState, useMemo } from 'react';
import { Quote, QuoteItem, QuoteStatus } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Receipt, MessageCircle, Trash2, Filter } from 'lucide-react';
import { useServices } from '@/hooks/useServices';
import { useServicePackages } from '@/hooks/useServicePackages';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';
import { WhatsappPreviewDialog } from '@/components/shared/WhatsappPreviewDialog';

interface ClientQuotesTabProps {
  quotes: Quote[];
  clientId: string;
  clientPhone: string;
  onAddQuote: (quote: Omit<Quote, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onUpdateQuote: (quote: Partial<Quote> & { id: string }) => Promise<unknown>;
}

const statusLabels: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  accepted: 'Aceito',
  rejected: 'Recusado',
  expired: 'Expirado',
};

const statusColors: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: ptBR }),
    });
  }
  return options;
};

export function ClientQuotesTab({ quotes, clientId, clientPhone, onAddQuote, onUpdateQuote }: ClientQuotesTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState('7');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { services } = useServices();
  const { packages } = useServicePackages();

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const itemOptions = useMemo(() => [
    ...services
      .filter((service) => service.is_active)
      .map((service) => ({
        value: `service:${service.id}`,
        label: service.name,
        sublabel: `Serviço · R$ ${Number(service.price || 0).toFixed(2)}`,
      })),
    ...packages
      .filter((pkg) => pkg.is_active)
      .map((pkg) => ({
        value: `package:${pkg.id}`,
        label: pkg.name,
        sublabel: `Pacote · ${pkg.total_sessions} sessões · R$ ${Number(pkg.total_price || 0).toFixed(2)}`,
      })),
  ], [services, packages]);

  const filteredQuotes = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    
    return quotes.filter(q => {
      try {
        const date = parseISO(q.created_at);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      } catch {
        return false;
      }
    });
  }, [quotes, selectedMonth]);

  const addItem = () => {
    setItems([...items, { service_id: '', service_name: '', item_type: 'service', quantity: 1, unit_price: 0, discount_amount: 0, total: 0 }]);
  };

  const updateItem = (index: number, value: string) => {
    const [itemType, itemId] = value.split(':') as ['service' | 'package', string];
    const item = itemType === 'package'
      ? packages.find((pkg) => pkg.id === itemId)
      : services.find((service) => service.id === itemId);
    if (!item) return;

    const unitPrice = itemType === 'package' ? Number((item as any).total_price || 0) : Number((item as any).price || 0);

    const newItems = [...items];
    newItems[index] = {
      service_id: item.id,
      service_name: item.name,
      item_type: itemType,
      quantity: 1,
      unit_price: unitPrice,
      discount_amount: 0,
      total: unitPrice,
    };
    setItems(newItems);
  };

  const updateQuantity = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = quantity;
    newItems[index].total = Math.max(0, (newItems[index].unit_price * quantity) - (newItems[index].discount_amount || 0));
    setItems(newItems);
  };

  const updateDiscount = (index: number, discount: number) => {
    const newItems = [...items];
    const gross = newItems[index].unit_price * newItems[index].quantity;
    newItems[index].discount_amount = Math.min(Math.max(0, discount), gross);
    newItems[index].total = Math.max(0, gross - (newItems[index].discount_amount || 0));
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const originalTotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const totalDiscount = items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Adicione pelo menos um serviço');
      return;
    }

    setLoading(true);
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + parseInt(validDays));

      await onAddQuote({
        client_id: clientId,
        status: 'draft',
        items,
        total_amount: totalAmount,
        notes: notes.trim() || null,
        sent_via: null,
        sent_at: null,
        valid_until: validUntil.toISOString().split('T')[0],
      });

      setOpen(false);
      setItems([]);
      setNotes('');
    } catch (error) {
      console.error('Error creating quote:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendViaWhatsApp = async (quote: Quote) => {
    const message = generateQuoteMessage(quote);
    openWhatsappWithMessage(clientPhone, message);

    await onUpdateQuote({
      id: quote.id,
      status: 'sent',
      sent_via: 'whatsapp',
      sent_at: new Date().toISOString(),
    });
  };

  const generateQuoteMessage = (quote: Quote) => {
    let message = `*ORÇAMENTO*\n\n📋 *Serviços:*\n`;
    quote.items.forEach((item) => {
      message += `• ${item.service_name} (${item.quantity}x) - R$ ${item.total.toFixed(2)}\n`;
    });
    message += `\n💰 *Total: R$ ${quote.total_amount.toFixed(2)}*\n`;
    if (quote.valid_until) {
      message += `\n📅 Válido até: ${format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}\n`;
    }
    if (quote.notes) {
      message += `\n📝 ${quote.notes}\n`;
    }
    return message;
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Criar Orçamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Serviços e pacotes</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                  </Button>
                </div>

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum item</p>
                ) : (
                  <div className="space-y-1.5">
                    {items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-1.5 items-end rounded border bg-muted/20 p-2">
                        <div className="col-span-12 sm:col-span-5">
                          <Label className="text-[10px] text-muted-foreground">Item</Label>
                          <SearchableSelect
                            value={item.service_id ? `${item.item_type || 'service'}:${item.service_id}` : ''}
                            onChange={(v) => updateItem(index, v)}
                            options={itemOptions}
                            placeholder="Selecione serviço ou pacote..."
                            searchPlaceholder="Buscar item..."
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-1">
                          <Label className="text-[10px] text-muted-foreground">Qtd.</Label>
                          <Input type="number" min="1" value={item.quantity} onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)} className="h-8 text-xs" />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-[10px] text-muted-foreground">Valor</Label>
                          <Input type="number" value={item.unit_price} readOnly className="h-8 text-xs bg-muted/40" />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-[10px] text-muted-foreground">Desconto</Label>
                          <Input type="number" min="0" step="0.01" value={item.discount_amount || ''} onChange={(e) => updateDiscount(index, parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
                        </div>
                        <div className="col-span-1 sm:col-span-2 flex items-center justify-end gap-1">
                          <span className="text-xs font-medium whitespace-nowrap">R$ {item.total.toFixed(2)}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(index)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="grid grid-cols-3 gap-2 p-2 bg-muted rounded text-xs">
                  <span>Valor: <strong>R$ {originalTotal.toFixed(2)}</strong></span>
                  <span>Desconto: <strong>R$ {totalDiscount.toFixed(2)}</strong></span>
                  <span className="text-right">Total: <strong>R$ {totalAmount.toFixed(2)}</strong></span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Validade (dias)</Label>
                <Input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className="h-8 text-xs" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condições especiais..." rows={2} className="text-xs" />
              </div>

              <Button onClick={handleSubmit} className="w-full h-8 text-xs" disabled={loading}>
                {loading ? 'Salvando...' : 'Criar Orçamento'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quotes List */}
      <Card>
        <CardContent className="p-3">
          {filteredQuotes.length === 0 ? (
            <div className="py-6 text-center">
              <Receipt className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum orçamento neste mês</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredQuotes.map((quote) => (
                <div key={quote.id} className="p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className={`${statusColors[quote.status]} text-[10px] px-1.5 py-0`} variant="secondary">
                          {statusLabels[quote.status]}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(quote.created_at), "dd/MM/yy", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {quote.items.map(i => `${i.item_type === 'package' ? 'Pacote: ' : ''}${i.quantity}x ${i.service_name}${(i.discount_amount || 0) > 0 ? ` (desc. R$ ${i.discount_amount.toFixed(2)})` : ''}`).join(', ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-primary">
                        R$ {quote.total_amount.toFixed(0)}
                      </span>
                      {quote.status === 'draft' && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => sendViaWhatsApp(quote)}>
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}