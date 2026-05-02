import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGoals, Goal, CreateGoalInput } from '@/hooks/useGoals';
import { useServices } from '@/hooks/useServices';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Target, DollarSign, Users, Calendar, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingGoal?: Goal | null;
}

export function NewGoalDialog({ open, onOpenChange, editingGoal }: NewGoalDialogProps) {
  const { createGoal, updateGoal } = useGoals();
  const { services } = useServices();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'revenue' as 'appointments' | 'revenue' | 'service_appointments',
    target_value: '',
    service_id: '',
    start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const isEditing = !!editingGoal;

  useEffect(() => {
    if (editingGoal) {
      setFormData({
        name: editingGoal.name,
        description: editingGoal.description || '',
        type: editingGoal.type,
        target_value: editingGoal.target_value.toString(),
        service_id: editingGoal.service_id || '',
        start_date: editingGoal.start_date,
        end_date: editingGoal.end_date
      });
    } else {
      setFormData({
        name: '',
        description: '',
        type: 'revenue',
        target_value: '',
        service_id: '',
        start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd')
      });
    }
  }, [editingGoal, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const goalData: CreateGoalInput = {
      name: formData.name,
      description: formData.description || undefined,
      type: formData.type,
      target_value: parseFloat(formData.target_value),
      service_id: formData.type === 'service_appointments' ? formData.service_id : undefined,
      start_date: formData.start_date,
      end_date: formData.end_date
    };

    if (isEditing && editingGoal) {
      await updateGoal.mutateAsync({
        id: editingGoal.id,
        ...goalData
      });
    } else {
      await createGoal.mutateAsync(goalData);
    }

    onOpenChange(false);
  };

  const goalTypes = [
    {
      value: 'revenue',
      label: 'Faturamento',
      icon: DollarSign,
      description: 'Soma de tudo que foi recebido no período (atendimentos pagos + vendas avulsas no caixa).',
      source: 'Agendamentos concluídos + Vendas do Caixa'
    },
    {
      value: 'appointments',
      label: 'Atendimentos',
      icon: Users,
      description: 'Quantidade total de atendimentos concluídos no período.',
      source: 'Agenda (status: concluído)'
    },
    {
      value: 'service_appointments',
      label: 'Serviço Específico',
      icon: Calendar,
      description: 'Quantidade de atendimentos concluídos de um serviço específico.',
      source: 'Agenda filtrada por serviço'
    }
  ];

  const quickPeriods = [
    { label: 'Este mês', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
    { label: 'Próximo mês', start: startOfMonth(addMonths(new Date(), 1)), end: endOfMonth(addMonths(new Date(), 1)) },
    { label: 'Próximos 3 meses', start: new Date(), end: endOfMonth(addMonths(new Date(), 2)) }
  ];

  const isLoading = createGoal.isPending || updateGoal.isPending;

  const selectedGoalType = goalTypes.find(t => t.value === formData.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {isEditing ? 'Editar Meta' : 'Nova Meta'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <form id="goal-form" onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
            {/* Goal Type Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipo de Meta</Label>
              <div className="grid grid-cols-3 gap-2">
                {goalTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.value as any, service_id: '' })}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      formData.type === type.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <type.icon className={cn(
                      "h-5 w-5 mb-2",
                      formData.type === type.value ? "text-primary" : "text-muted-foreground"
                    )} />
                    <p className="text-sm font-medium">{type.label}</p>
                  </button>
                ))}
              </div>
              
              {/* Data Source Info */}
              {selectedGoalType && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-blue-800">{selectedGoalType.description}</p>
                      <p className="text-blue-600">
                        <span className="font-medium">Fonte dos dados:</span> {selectedGoalType.source}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Service Selection (for service_appointments) */}
            {formData.type === 'service_appointments' && (
              <div className="space-y-2">
                <Label>Serviço</Label>
                <Select
                  value={formData.service_id}
                  onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.filter(s => s.is_active).map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Meta</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={
                  formData.type === 'revenue' 
                    ? 'Ex: Meta de faturamento de janeiro' 
                    : 'Ex: Meta de atendimentos do mês'
                }
                required
              />
            </div>

            {/* Target Value */}
            <div className="space-y-2">
              <Label htmlFor="target_value">
                {formData.type === 'revenue' ? 'Valor da Meta (R$)' : 'Quantidade de Atendimentos'}
              </Label>
              {formData.type === 'revenue' ? (
                <CurrencyInput
                  id="target_value"
                  value={formData.target_value}
                  onValueChange={(value) => setFormData({ ...formData, target_value: String(value) })}
                  placeholder="100.000,00"
                  required
                />
              ) : (
                <Input
                  id="target_value"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                  placeholder="50"
                  required
                />
              )}
              {formData.type === 'revenue' && (
                <p className="text-xs text-muted-foreground">
                  O valor será calculado automaticamente baseado nos pagamentos recebidos
                </p>
              )}
            </div>

            {/* Period */}
            <div className="space-y-3">
              <Label>Período da Meta</Label>
              <div className="flex gap-2 flex-wrap">
                {quickPeriods.map((period) => (
                  <Button
                    key={period.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData({
                      ...formData,
                      start_date: format(period.start, 'yyyy-MM-dd'),
                      end_date: format(period.end, 'yyyy-MM-dd')
                    })}
                    className={cn(
                      formData.start_date === format(period.start, 'yyyy-MM-dd') &&
                      formData.end_date === format(period.end, 'yyyy-MM-dd') &&
                      "border-primary bg-primary/5"
                    )}
                  >
                    {period.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="start_date" className="text-xs">Data Início</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end_date" className="text-xs">Data Fim</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Adicione observações sobre esta meta..."
                rows={3}
              />
            </div>

            {/* Sync Info */}
            <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Sincronização Automática
              </h4>
              <p className="text-xs text-muted-foreground">
                O progresso da meta é atualizado automaticamente com base nos dados reais:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                <li><span className="font-medium">Faturamento:</span> Soma de agendamentos pagos + vendas avulsas do caixa</li>
                <li><span className="font-medium">Atendimentos:</span> Total de agendamentos com status "concluído"</li>
                <li><span className="font-medium">Serviço específico:</span> Agendamentos concluídos do serviço selecionado</li>
              </ul>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="goal-form" disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Salvar' : 'Criar Meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
