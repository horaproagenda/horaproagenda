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
import { toast } from 'sonner';

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

  const monthOptions = useMemo(() => getMonthOptions(), []);

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
    setItems([...items, { service_id: '', service_name: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const updateItem = (index: number, serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;

    const newItems = [...items];
    newItems[index] = {
      service_id: service.id,
      service_name: service.name,
      quantity: 1,
      unit_price: service.price,
      total: service.price,
    };
    setItems(newItems);
  };

  const updateQuantity = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = quantity;
    newItems[index].total = newItems[index].unit_price * quantity;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

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
    const phone = clientPhone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');

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
                  <Label className="text-xs">Serviços</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                  </Button>
                </div>

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum serviço</p>
                ) : (
                  <div className="space-y-1.5">
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-1.5 items-center">
                        <Select value={item.service_id} onValueChange={(v) => updateItem(index, v)}>
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {services.filter((s) => s.is_active).map((service) => (
                              <SelectItem key={service.id} value={service.id} className="text-xs">
                                {service.name} - R$ {service.price.toFixed(0)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-14 h-8 text-xs"
                        />
                        <span className="w-16 text-right text-xs font-medium">R$ {item.total.toFixed(0)}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(index)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="flex justify-end p-2 bg-muted rounded text-sm font-bold">
                  Total: R$ {totalAmount.toFixed(2)}
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
                        {quote.items.map(i => `${i.quantity}x ${i.service_name}`).join(', ')}
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