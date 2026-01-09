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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useGoals, Goal, CreateGoalInput } from '@/hooks/useGoals';
import { useServices } from '@/hooks/useServices';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Target, DollarSign, Users, Calendar, Loader2 } from 'lucide-react';
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
      description: 'Meta de valor total recebido'
    },
    { 
      value: 'appointments', 
      label: 'Atendimentos', 
      icon: Users,
      description: 'Meta de quantidade de atendimentos'
    },
    { 
      value: 'service_appointments', 
      label: 'Serviço Específico', 
      icon: Calendar,
      description: 'Meta de atendimentos de um serviço'
    }
  ];

  const quickPeriods = [
    { label: 'Este mês', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
    { label: 'Próximo mês', start: startOfMonth(addMonths(new Date(), 1)), end: endOfMonth(addMonths(new Date(), 1)) },
    { label: 'Próximos 3 meses', start: new Date(), end: endOfMonth(addMonths(new Date(), 2)) }
  ];

  const isLoading = createGoal.isPending || updateGoal.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {isEditing ? 'Editar Meta' : 'Nova Meta'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Goal Type Selection */}
          <div className="space-y-3">
            <Label>Tipo de Meta</Label>
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
              {formData.type === 'revenue' ? 'Valor da Meta (R$)' : 'Quantidade'}
            </Label>
            <div className="relative">
              {formData.type === 'revenue' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
              )}
              <Input
                id="target_value"
                type="number"
                min="0"
                step={formData.type === 'revenue' ? '0.01' : '1'}
                value={formData.target_value}
                onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                className={formData.type === 'revenue' ? 'pl-10' : ''}
                placeholder={formData.type === 'revenue' ? '100000.00' : '50'}
                required
              />
            </div>
          </div>

          {/* Period */}
          <div className="space-y-3">
            <Label>Período</Label>
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
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
