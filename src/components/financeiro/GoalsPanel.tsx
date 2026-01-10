import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Target, 
  Plus, 
  TrendingUp, 
  Calendar, 
  Users, 
  DollarSign,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useGoals, Goal } from '@/hooks/useGoals';
import { NewGoalDialog } from './NewGoalDialog';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export function GoalsPanel() {
  const { goals, isLoading, calculateGoalProgress, updateGoal, deleteGoal, refetch } = useGoals();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [goalsWithProgress, setGoalsWithProgress] = useState<(Goal & { calculatedValue: number })[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate progress for all goals
  useEffect(() => {
    const loadProgress = async () => {
      setIsCalculating(true);
      try {
        const withProgress = await Promise.all(
          goals.map(async (goal) => {
            const calculatedValue = await calculateGoalProgress(goal);
            return { ...goal, calculatedValue };
          })
        );
        setGoalsWithProgress(withProgress);
      } finally {
        setIsCalculating(false);
      }
    };

    if (goals.length > 0) {
      loadProgress();
    } else {
      setGoalsWithProgress([]);
    }
  }, [goals, calculateGoalProgress]);

  const activeGoals = goalsWithProgress.filter(g => g.status === 'active' && g.is_active);
  const completedGoals = goalsWithProgress.filter(g => g.status === 'completed');

  const getGoalIcon = (type: string) => {
    switch (type) {
      case 'appointments':
        return <Users className="h-4 w-4" />;
      case 'revenue':
        return <DollarSign className="h-4 w-4" />;
      case 'service_appointments':
        return <Calendar className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getGoalTypeLabel = (type: string) => {
    switch (type) {
      case 'appointments':
        return 'Atendimentos';
      case 'revenue':
        return 'Faturamento';
      case 'service_appointments':
        return 'Serviço Específico';
      default:
        return type;
    }
  };

  const getDataSourceLabel = (type: string) => {
    switch (type) {
      case 'appointments':
        return 'Agenda (concluídos)';
      case 'revenue':
        return 'Agendamentos + Caixa';
      case 'service_appointments':
        return 'Agenda filtrada';
      default:
        return '';
    }
  };

  const formatValue = (value: number, type: string) => {
    if (type === 'revenue') {
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(value);
    }
    return value.toString();
  };

  const getProgressPercentage = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(100, (current / target) * 100);
  };

  const getGoalStatus = (goal: Goal & { calculatedValue: number }) => {
    const today = new Date();
    const endDate = parseISO(goal.end_date);
    const percentage = getProgressPercentage(goal.calculatedValue, goal.target_value);

    if (percentage >= 100) {
      return { label: 'Atingida', variant: 'default' as const, color: 'text-green-600' };
    }
    if (isAfter(today, endDate)) {
      return { label: 'Expirada', variant: 'secondary' as const, color: 'text-muted-foreground' };
    }
    if (percentage >= 75) {
      return { label: 'Quase lá', variant: 'outline' as const, color: 'text-yellow-600' };
    }
    return { label: 'Em andamento', variant: 'outline' as const, color: 'text-blue-600' };
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setDialogOpen(true);
  };

  const handleDelete = (goal: Goal) => {
    setGoalToDelete(goal);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (goalToDelete) {
      deleteGoal.mutate(goalToDelete.id);
      setDeleteDialogOpen(false);
      setGoalToDelete(null);
    }
  };

  const handleComplete = (goal: Goal) => {
    updateGoal.mutate({ id: goal.id, status: 'completed' });
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingGoal(null);
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-24 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Metas</h2>
          {activeGoals.length > 0 && (
            <Badge variant="secondary">{activeGoals.length} ativas</Badge>
          )}
          {isCalculating && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isCalculating}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isCalculating && "animate-spin")} />
            Atualizar
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Meta
          </Button>
        </div>
      </div>

      {/* Data Source Info */}
      <div className="p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
        <p className="font-medium mb-1">📊 Dados sincronizados automaticamente:</p>
        <ul className="space-y-0.5 ml-4 list-disc">
          <li><span className="font-medium">Faturamento:</span> Soma de pagamentos (agendamentos concluídos + vendas do caixa)</li>
          <li><span className="font-medium">Atendimentos:</span> Agendamentos com status "concluído" no período</li>
        </ul>
      </div>

      {/* Active Goals */}
      {activeGoals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-2">Nenhuma meta ativa</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie metas para acompanhar o desempenho do seu negócio
            </p>
            <Button onClick={() => setDialogOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeGoals.map((goal) => {
            const percentage = getProgressPercentage(goal.calculatedValue, goal.target_value);
            const status = getGoalStatus(goal);

            return (
              <Card key={goal.id} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-2 rounded-lg",
                        goal.type === 'revenue' ? 'bg-green-100 text-green-700' :
                        goal.type === 'appointments' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      )}>
                        {getGoalIcon(goal.type)}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">{goal.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {getGoalTypeLabel(goal.type)}
                          {goal.service && ` - ${goal.service.name}`}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(goal)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleComplete(goal)}>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Marcar como concluída
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(goal)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className={status.color}>
                        {formatValue(goal.calculatedValue, goal.type)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatValue(goal.target_value, goal.type)}
                      </span>
                    </div>
                    <Progress 
                      value={percentage} 
                      className={cn(
                        "h-2",
                        percentage >= 100 && "[&>div]:bg-green-500",
                        percentage >= 75 && percentage < 100 && "[&>div]:bg-yellow-500"
                      )}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-muted-foreground">
                        {percentage.toFixed(0)}% concluído
                      </span>
                      <Badge variant={status.variant} className="text-xs">
                        {status.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(parseISO(goal.start_date), 'dd/MM', { locale: ptBR })} - {format(parseISO(goal.end_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>Fonte: {getDataSourceLabel(goal.type)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Metas Concluídas ({completedGoals.length})
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {completedGoals.slice(0, 3).map((goal) => (
              <Card key={goal.id} className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{goal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatValue(goal.calculatedValue, goal.type)} / {formatValue(goal.target_value, goal.type)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewGoalDialog 
        open={dialogOpen} 
        onOpenChange={handleDialogClose}
        editingGoal={editingGoal}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a meta "{goalToDelete?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
