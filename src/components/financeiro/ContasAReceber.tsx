import { useMemo, useEffect } from 'react';
import { format, parseISO, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trash2, Check, Calendar } from 'lucide-react';
import { useFinancialEntries } from '@/hooks/useFinancialEntries';
import { useAppointments } from '@/hooks/useAppointments';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function ContasAReceber() {
  const { receivables, updateEntry, deleteEntry } = useFinancialEntries();
  const { appointments } = useAppointments();
  const queryClient = useQueryClient();

  // Real-time sync with agenda, caixa and financeiro
  useEffect(() => {
    const channel = supabase
      .channel('contas_a_receber_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Combine financial entries with pending appointments
  const allReceivables = useMemo(() => {
    // Get pending financial entries - exclude zero amounts and discount entries
    const pendingFinancialEntries = receivables
      .filter(e => {
        const isPending = e.status === 'pending' || e.status === 'overdue';
        const hasAmount = Number(e.amount) > 0;
        
        // Precise discount detection — only exclude entries that ARE discounts,
        // not entries that merely mention the word in passing
        const desc = (e.description || '').toLowerCase().trim();
        const isDiscountDescription = 
          desc.startsWith('desconto') ||
          desc === 'desconto' ||
          /^desconto\s*([-–—:])/.test(desc) ||
          /^desconto\s+(de|do|da|no|na|em|sobre|aplicado|concedido)/i.test(desc);
        
        // Only treat 'credit' type as discount when it's actually a discount entry
        const isDiscountType = e.type === 'credit' && isDiscountDescription;
        
        const isDiscount = isDiscountDescription || isDiscountType;
        
        return isPending && hasAmount && !isDiscount;
      })
      .map(e => ({
        id: e.id,
        type: 'financial_entry' as const,
        date: e.due_date,
        description: e.description,
        clientName: e.client?.name || '-',
        amount: Number(e.amount),
        installments: e.installments || 1,
        status: e.status,
        originalEntry: e,
      }));

    // Get appointments with pending or partial payment
    const excludedStatuses = ['cancelled', 'missed', 'rescheduled', 'no_show'];
    const pendingAppointments = appointments
      .filter(apt => {
        const paymentPending = apt.payment_status === 'pending' || apt.payment_status === 'partial';
        const statusExcluded = excludedStatuses.includes(apt.status);
        
        // Skip zero-value services
        const servicePrice = apt.service?.price || 0;
        const isZeroValueService = servicePrice === 0;
        
        // Skip package appointments with zero price
        const packagePrice = apt.package_appointment?.package?.total_price || 0;
        const isZeroValuePackage = !!apt.package_appointment && packagePrice === 0;

        // Skip if payment was already fully covered by discount
        const amountPaid = apt.amount_paid || 0;
        const totalAmount = apt.package_appointment 
          ? (apt.package_appointment.package?.total_price || 0)
          : servicePrice;
        const remainingAfterPayment = Math.max(0, totalAmount - amountPaid);
        const isFullyDiscounted = remainingAfterPayment === 0 && amountPaid > 0;
        
        return paymentPending && !statusExcluded && !isZeroValueService && !isZeroValuePackage && !isFullyDiscounted;
      })
      .map(apt => {
        const isPackageAppointment = !!apt.package_appointment;
        const packageData = apt.package_appointment?.package;
        
        const isPackagePaid = packageData?.payment_methods && packageData.payment_methods.length > 0;
        if (isPackagePaid) return null;
        
        const packagePrice = packageData?.total_price || 0;
        if (isPackageAppointment && packagePrice === 0) return null;
        
        const servicePrice = apt.service?.price || 0;
        const totalAmount = isPackageAppointment ? packagePrice : servicePrice;
        
        if (totalAmount === 0) return null;
        
        const amountPaid = apt.amount_paid || 0;
        const remainingAmount = Math.max(0, totalAmount - amountPaid);
        
        // Skip if remaining is zero (fully paid via discount or other)
        if (remainingAmount === 0) return null;
        
        return {
          id: apt.id,
          type: 'appointment' as const,
          date: apt.start_time.split('T')[0],
          description: isPackageAppointment 
            ? (packageData?.name || 'Pacote') 
            : (apt.service?.name || 'Agendamento'),
          clientName: apt.client?.name || '-',
          amount: remainingAmount,
          installments: 1,
          status: isAfter(new Date(), parseISO(apt.start_time)) ? 'overdue' : 'pending',
          isPartial: apt.payment_status === 'partial',
          originalAppointment: apt,
        };
      })
      .filter(apt => apt !== null && apt.amount > 0);

    return [...pendingFinancialEntries, ...pendingAppointments].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [receivables, appointments]);

  const getStatusBadge = (item: typeof allReceivables[0] & { isPartial?: boolean }) => {
    if (item.status === 'paid') {
      return <Badge className="bg-green-500 hover:bg-green-600 text-[10px] h-5 px-1.5">Recebido</Badge>;
    }
    const dueDate = parseISO(item.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if ('isPartial' in item && item.isPartial) {
      return <Badge className="bg-blue-500 hover:bg-blue-600 text-[10px] h-5 px-1.5">Parcial</Badge>;
    }
    
    if (isAfter(today, dueDate)) {
      return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Vencido</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Pendente</Badge>;
  };

  const getTypeBadge = (type: 'financial_entry' | 'appointment') => {
    if (type === 'appointment') {
      return <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px] h-5 px-1.5"><Calendar className="h-2.5 w-2.5 mr-0.5" />Agend.</Badge>;
    }
    return null;
  };

  const handleMarkAsReceived = async (item: typeof allReceivables[0]) => {
    if (item.type === 'financial_entry' && item.originalEntry) {
      await updateEntry.mutateAsync({
        id: item.id,
        status: 'paid' as const,
        paid_date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
  };

  const handleDelete = async (item: typeof allReceivables[0]) => {
    if (item.type === 'financial_entry') {
      await deleteEntry.mutate(item.id);
    }
  };

  const totalPending = allReceivables.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm font-semibold">A Receber</CardTitle>
        <div className="text-xs font-bold text-green-600">
          Total: R$ {totalPending.toFixed(2)}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <ScrollArea className="h-[320px]">
          <div className="min-w-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Data</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Descrição</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Cliente</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Tipo</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Valor</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Parcela</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-[10px] py-1.5 px-2 text-right whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allReceivables.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell className="text-[11px] py-1.5 px-2 whitespace-nowrap">{format(parseISO(item.date), 'dd/MM/yy')}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 max-w-[120px] truncate">{item.description}</TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2 max-w-[100px] truncate">{item.clientName}</TableCell>
                    <TableCell className="py-1.5 px-2">{getTypeBadge(item.type)}</TableCell>
                    <TableCell className="text-green-600 font-medium text-[11px] py-1.5 px-2 whitespace-nowrap">
                      R$ {item.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-[11px] py-1.5 px-2">{item.installments}x</TableCell>
                    <TableCell className="py-1.5 px-2">{getStatusBadge(item)}</TableCell>
                    <TableCell className="text-right py-1.5 px-2">
                      <div className="flex justify-end gap-0.5">
                        {item.type === 'financial_entry' && item.status === 'pending' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => handleMarkAsReceived(item)} 
                            title="Marcar como recebido"
                          >
                            <Check className="h-3 w-3 text-green-600" />
                          </Button>
                        )}
                        {item.type === 'appointment' && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            Agenda
                          </span>
                        )}
                        {item.type === 'financial_entry' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {allReceivables.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-xs">
                      Nenhum valor a receber pendente
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
