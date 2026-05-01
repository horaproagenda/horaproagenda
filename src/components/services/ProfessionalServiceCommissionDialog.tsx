import { useState, useEffect } from 'react';
import { Settings2, Plus, Trash2, Percent, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useServices } from '@/hooks/useServices';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ServiceCommission {
  id: string;
  professional_id: string;
  service_id: string;
  commission_type: string;
  commission_percentage: number;
  commission_fixed_value: number;
}

export function ProfessionalServiceCommissionDialog({ professionalId, professionalName, children }: {
  professionalId: string;
  professionalName: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [addingService, setAddingService] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [commType, setCommType] = useState('percentage');
  const [commPercentage, setCommPercentage] = useState(0);
  const [commFixedValue, setCommFixedValue] = useState(0);
  const [saving, setSaving] = useState(false);

  const { services } = useServices();
  const queryClient = useQueryClient();

  const { data: commissions = [], refetch } = useQuery({
    queryKey: ['professional_service_commissions', professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_service_commissions' as any)
        .select('*')
        .eq('professional_id', professionalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ServiceCommission[];
    },
    enabled: open && !!professionalId,
  });

  // Realtime sync
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`psc_${professionalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professional_service_commissions', filter: `professional_id=eq.${professionalId}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, professionalId, refetch]);

  const linkedServiceIds = commissions.map(c => c.service_id);
  const availableServices = services.filter(s => s.is_active && !linkedServiceIds.includes(s.id));

  const handleAdd = async () => {
    if (!selectedServiceId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('professional_service_commissions' as any)
        .insert({
          professional_id: professionalId,
          service_id: selectedServiceId,
          commission_type: commType,
          commission_percentage: commType === 'percentage' ? commPercentage : 0,
          commission_fixed_value: commType === 'fixed' ? commFixedValue : 0,
        } as any);
      if (error) throw error;
      toast.success('Comissão por serviço vinculada!');
      setAddingService(false);
      setSelectedServiceId('');
      setCommPercentage(0);
      setCommFixedValue(0);
      refetch();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('professional_service_commissions' as any).delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover: ' + error.message);
    } else {
      toast.success('Vínculo removido!');
      refetch();
    }
  };

  const getServiceName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Serviço';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Comissões por Serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-base">Comissões por Serviço — {professionalName}</DialogTitle>
          <DialogDescription className="text-xs">
            Configure se o profissional recebe porcentagem ou valor fixo em cada serviço.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {commissions.map(comm => (
              <div key={comm.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div>
                  <span className="text-sm font-medium">{getServiceName(comm.service_id)}</span>
                  <div className="flex items-center gap-2 mt-1">
                    {comm.commission_type === 'percentage' ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Percent className="h-3 w-3" /> {comm.commission_percentage}%
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <DollarSign className="h-3 w-3" /> R$ {Number(comm.commission_fixed_value).toFixed(2)}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(comm.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            {commissions.length === 0 && !addingService && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum serviço vinculado. Adicione abaixo.
              </p>
            )}

            {addingService ? (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div>
                  <Label className="text-xs">Serviço</Label>
                  <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                    <SelectTrigger className="h-9 text-sm mt-1">
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableServices.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Tipo</Label>
                  <RadioGroup value={commType} onValueChange={setCommType} className="flex gap-4 mt-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="percentage" id="pct" />
                      <Label htmlFor="pct" className="text-xs">Porcentagem</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="fixed" id="fix" />
                      <Label htmlFor="fix" className="text-xs">Valor Fixo</Label>
                    </div>
                  </RadioGroup>
                </div>

                {commType === 'percentage' ? (
                  <div>
                    <Label className="text-xs">Porcentagem (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={commPercentage} onChange={e => setCommPercentage(Number(e.target.value))} className="h-9 text-sm mt-1" />
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Valor Fixo (R$)</Label>
                    <Input type="number" min={0} step={0.01} value={commFixedValue} onChange={e => setCommFixedValue(Number(e.target.value))} className="h-9 text-sm mt-1" />
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setAddingService(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleAdd} disabled={!selectedServiceId || saving} className="btn-vibrant">
                    {saving ? 'Salvando...' : 'Vincular'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAddingService(true)} disabled={availableServices.length === 0}>
                <Plus className="h-4 w-4" />
                {availableServices.length === 0 ? 'Todos os serviços já vinculados' : 'Adicionar Serviço'}
              </Button>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
