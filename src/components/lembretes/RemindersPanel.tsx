import { useState } from 'react';
import { format, parseISO, isToday, isPast, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell,
  Plus,
  Edit,
  Trash2,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Repeat,
  Flag,
} from 'lucide-react';
import { useReminders, type Reminder } from '@/hooks/useReminders';
import { useAuth } from '@/contexts/AuthContext';

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'text-blue-500' },
  { value: 'normal', label: 'Normal', color: 'text-yellow-500' },
  { value: 'high', label: 'Alta', color: 'text-red-500' },
];

const RECURRING_FREQUENCIES = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export function RemindersPanel() {
  const { 
    activeReminders, 
    completedReminders, 
    isLoading, 
    createReminder, 
    updateReminder, 
    completeReminder, 
    deleteReminder 
  } = useReminders();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reminder_date: '',
    reminder_time: '',
    is_recurring: false,
    recurring_frequency: 'daily',
    recurring_days: [] as number[],
    category: '',
    priority: 'normal',
    is_active: true,
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      reminder_date: '',
      reminder_time: '',
      is_recurring: false,
      recurring_frequency: 'daily',
      recurring_days: [],
      category: '',
      priority: 'normal',
      is_active: true,
    });
    setEditingReminder(null);
  };

  const openEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setFormData({
      title: reminder.title,
      description: reminder.description || '',
      reminder_date: reminder.reminder_date || '',
      reminder_time: reminder.reminder_time || '',
      is_recurring: reminder.is_recurring,
      recurring_frequency: reminder.recurring_frequency || 'daily',
      recurring_days: reminder.recurring_days || [],
      category: reminder.category || '',
      priority: reminder.priority,
      is_active: reminder.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) return;

    const data = {
      title: formData.title,
      description: formData.description || null,
      reminder_date: formData.reminder_date || null,
      reminder_time: formData.reminder_time || null,
      is_recurring: formData.is_recurring,
      recurring_frequency: formData.is_recurring ? formData.recurring_frequency : null,
      recurring_days: formData.is_recurring && formData.recurring_days.length > 0 ? formData.recurring_days : null,
      category: formData.category || null,
      priority: formData.priority,
      is_active: formData.is_active,
      is_completed: false,
    };

    if (editingReminder) {
      await updateReminder.mutateAsync({ id: editingReminder.id, ...data });
    } else {
      await createReminder.mutateAsync(data);
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleToggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      recurring_days: prev.recurring_days.includes(day)
        ? prev.recurring_days.filter(d => d !== day)
        : [...prev.recurring_days, day],
    }));
  };

  const getPriorityColor = (priority: string) => {
    return PRIORITIES.find(p => p.value === priority)?.color || 'text-muted-foreground';
  };

  const ReminderCard = ({ reminder }: { reminder: Reminder }) => {
    const isOverdue = reminder.reminder_date && isPast(parseISO(reminder.reminder_date)) && !isToday(parseISO(reminder.reminder_date));
    const isTodayReminder = reminder.reminder_date && isToday(parseISO(reminder.reminder_date));

    return (
      <Card className={`transition-all ${isOverdue ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : isTodayReminder ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={reminder.is_completed}
              onCheckedChange={() => completeReminder.mutate(reminder.id)}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-medium ${reminder.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                  {reminder.title}
                </h3>
                <Flag className={`h-4 w-4 ${getPriorityColor(reminder.priority)}`} />
                {reminder.is_recurring && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Repeat className="h-3 w-3" />
                    {RECURRING_FREQUENCIES.find(f => f.value === reminder.recurring_frequency)?.label}
                  </Badge>
                )}
              </div>
              {reminder.description && (
                <p className="text-sm text-muted-foreground mb-2">{reminder.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {reminder.reminder_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(reminder.reminder_date), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                )}
                {reminder.reminder_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {reminder.reminder_time.slice(0, 5)}
                  </span>
                )}
                {reminder.category && (
                  <Badge variant="secondary" className="text-xs">
                    {reminder.category}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <Button variant="ghost" size="icon" onClick={() => openEdit(reminder)}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir Lembrete</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir este lembrete?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteReminder.mutate(reminder.id)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Lembretes e Rotinas
        </h2>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Lembrete
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingReminder ? 'Editar Lembrete' : 'Novo Lembrete'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Título do lembrete"
                  />
                </div>

                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={formData.reminder_date}
                      onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={formData.reminder_time}
                      onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prioridade</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(v) => setFormData({ ...formData, priority: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Input
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Ex: Financeiro"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Recorrente</Label>
                  <Switch
                    checked={formData.is_recurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                  />
                </div>

                {formData.is_recurring && (
                  <>
                    <div>
                      <Label>Frequência</Label>
                      <Select
                        value={formData.recurring_frequency}
                        onValueChange={(v) => setFormData({ ...formData, recurring_frequency: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECURRING_FREQUENCIES.map(f => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.recurring_frequency === 'weekly' && (
                      <div>
                        <Label>Dias da Semana</Label>
                        <div className="flex gap-2 mt-2">
                          {DAYS_OF_WEEK.map(day => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={formData.recurring_days.includes(day.value) ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleToggleDay(day.value)}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <Button onClick={handleSubmit} className="w-full" disabled={!formData.title.trim()}>
                  {editingReminder ? 'Salvar' : 'Criar Lembrete'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Pendentes
            <Badge variant="secondary">{activeReminders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Concluídos
            <Badge variant="secondary">{completedReminders.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeReminders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">Nenhum lembrete pendente</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {activeReminders.map(reminder => (
                  <ReminderCard key={reminder.id} reminder={reminder} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedReminders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">Nenhum lembrete concluído</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {completedReminders.map(reminder => (
                  <ReminderCard key={reminder.id} reminder={reminder} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
