import { useState } from 'react';
import { Quote, QuoteItem, QuoteStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Receipt, Send, MessageCircle, Trash2 } from 'lucide-react';
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
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export function ClientQuotesTab({
  quotes,
  clientId,
  clientPhone,
  onAddQuote,
  onUpdateQuote,
}: ClientQuotesTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState('7');
  const { services } = useServices();

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
    let message = `*ORÇAMENTO*\n\n`;
    message += `📋 *Serviços:*\n`;
    
    quote.items.forEach((item) => {
      message += `• ${item.service_name} (${item.quantity}x) - R$ ${item.total.toFixed(2)}\n`;
    });
    
    message += `\n💰 *Total: R$ ${quote.total_amount.toFixed(2)}*\n`;
    
    if (quote.valid_until) {
      message += `\n📅 Válido até: ${format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}\n`;
    }
    
    if (quote.notes) {
      message += `\n📝 Observações: ${quote.notes}\n`;
    }
    
    return message;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Orçamentos</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Orçamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Orçamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Serviços</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Serviço
                  </Button>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum serviço adicionado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Select
                          value={item.service_id}
                          onValueChange={(v) => updateItem(index, v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Selecione um serviço" />
                          </SelectTrigger>
                          <SelectContent>
                            {services
                              .filter((s) => s.is_active)
                              .map((service) => (
                                <SelectItem key={service.id} value={service.id}>
                                  {service.name} - R$ {service.price.toFixed(2)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                        <span className="w-24 text-right font-medium">
                          R$ {item.total.toFixed(2)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="flex justify-end p-3 bg-muted rounded-lg">
                  <p className="text-lg font-bold">Total: R$ {totalAmount.toFixed(2)}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Validade (dias)</Label>
                <Input
                  type="number"
                  min="1"
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condições especiais, formas de pagamento..."
                  rows={3}
                />
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={loading}>
                {loading ? 'Salvando...' : 'Criar Orçamento'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum orçamento cadastrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={statusColors[quote.status]} variant="secondary">
                        {statusLabels[quote.status]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(quote.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      {quote.sent_via && (
                        <span className="text-xs text-muted-foreground">
                          • Enviado via {quote.sent_via}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1">
                      {quote.items.map((item, i) => (
                        <p key={i}>
                          {item.quantity}x {item.service_name} - R$ {item.total.toFixed(2)}
                        </p>
                      ))}
                    </div>

                    {quote.valid_until && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Válido até {format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold text-primary">
                      R$ {quote.total_amount.toFixed(2)}
                    </p>
                    {quote.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendViaWhatsApp(quote)}
                      >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        WhatsApp
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
  );
}
