import { useState } from 'react';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
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
  const [searchTerm, setSearchTerm] = useState('');

  // Filter reminders by search
  const filteredActiveReminders = activeReminders.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredCompletedReminders = completedReminders.filter(r =>
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <Card className={`card-hover transition-all ${isOverdue ? 'border-l-4 border-l-red-500' : isTodayReminder ? 'border-l-4 border-l-amber-500' : ''}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              checked={reminder.is_completed}
              onCheckedChange={() => completeReminder.mutate(reminder.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h3 className={`font-medium text-sm ${reminder.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                  {reminder.title}
                </h3>
                <Flag className={`h-3 w-3 ${getPriorityColor(reminder.priority)}`} />
                {reminder.is_recurring && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 h-4 px-1">
                    <Repeat className="h-2.5 w-2.5" />
                    {RECURRING_FREQUENCIES.find(f => f.value === reminder.recurring_frequency)?.label}
                  </Badge>
                )}
              </div>
              {reminder.description && (
                <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{reminder.description}</p>
              )}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {reminder.reminder_date && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-2.5 w-2.5" />
                    {format(parseISO(reminder.reminder_date), "dd/MM", { locale: ptBR })}
                  </span>
                )}
                {reminder.reminder_time && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {reminder.reminder_time.slice(0, 5)}
                  </span>
                )}
                {reminder.category && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                    {reminder.category}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(reminder)}>
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-base">Excluir Lembrete</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm">
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 w-full sm:max-w-xs">
          <Input
            placeholder="Buscar lembretes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 btn-vibrant">
                <Plus className="h-3.5 w-3.5" />
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
      <Tabs defaultValue="active" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="active" className="gap-1.5 text-xs px-3">
            <AlertCircle className="h-3 w-3" />
            Pendentes
            <Badge variant="secondary" className="h-4 text-[10px] ml-1">{filteredActiveReminders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5 text-xs px-3">
            <CheckCircle className="h-3 w-3" />
            Concluídos
            <Badge variant="secondary" className="h-4 text-[10px] ml-1">{filteredCompletedReminders.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="page-enter">
          {filteredActiveReminders.length === 0 ? (
            <Card className="card-hover">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum lembrete pendente</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[450px]">
              <div className="space-y-2 pr-4">
                {filteredActiveReminders.map(reminder => (
                  <ReminderCard key={reminder.id} reminder={reminder} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="completed" className="page-enter">
          {filteredCompletedReminders.length === 0 ? (
            <Card className="card-hover">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum lembrete concluído</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[450px]">
              <div className="space-y-2 pr-4">
                {filteredCompletedReminders.map(reminder => (
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
