import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { KitScope } from '@/hooks/useKitAppointments';

interface KitScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'save' | 'delete';
  onConfirm: (scope: KitScope) => void;
  pending?: boolean;
}

const OPTIONS: Array<{ value: KitScope; label: (mode: 'save' | 'delete') => string; hint: string }> = [
  {
    value: 'single',
    label: (mode) => (mode === 'save' ? 'Salvar somente este' : 'Apagar somente este'),
    hint: 'Os outros serviços do kit continuam como estão.',
  },
  {
    value: 'future',
    label: (mode) => (mode === 'save' ? 'Salvar este e os futuros' : 'Apagar este e os futuros'),
    hint: 'Vale para este serviço e para os que vêm depois dele.',
  },
  {
    value: 'all',
    label: (mode) => (mode === 'save' ? 'Salvar todos do kit' : 'Apagar todos do kit'),
    hint: 'Vale para todos os serviços do kit, inclusive os anteriores.',
  },
];

export function KitScopeDialog({ open, onOpenChange, mode, onConfirm, pending }: KitScopeDialogProps) {
  const [scope, setScope] = useState<KitScope>('single');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'save' ? 'Alterar serviços do kit' : 'Apagar serviços do kit'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Este atendimento faz parte de um kit de serviços. Escolha o que fazer:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup value={scope} onValueChange={(v) => setScope(v as KitScope)} className="space-y-2">
          {OPTIONS.map((option) => (
            <div key={option.value} className="flex items-start gap-3 rounded border p-2 hover:bg-muted/50">
              <RadioGroupItem value={option.value} id={`kit-scope-${option.value}`} className="mt-1" />
              <div className="flex-1">
                <Label htmlFor={`kit-scope-${option.value}`} className="cursor-pointer text-sm font-medium">
                  {option.label(mode)}
                </Label>
                <p className="text-xs text-muted-foreground">{option.hint}</p>
              </div>
            </div>
          ))}
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm(scope);
            }}
            className={mode === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {mode === 'save' ? 'Confirmar alteração' : 'Confirmar exclusão'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
