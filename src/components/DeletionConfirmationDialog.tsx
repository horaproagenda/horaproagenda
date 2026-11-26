import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getPendingDeletion, resolveDeletion, subscribeDeletion, type DeletionConfirmation } from '@/lib/deletionConfirmation';

export function DeletionSummary({ itemName, removed, preserved, details }: DeletionConfirmation) {
  return <span className="block space-y-3 break-words">
    <span className="block">Excluir permanentemente <strong>“{itemName}”</strong>?</span>
    <span className="block"><strong>Serão removidos:</strong>{removed.map(item => <span className="block pl-3" key={item}>• {item}</span>)}</span>
    {!!preserved?.length && <span className="block"><strong>Serão mantidos:</strong>{preserved.map(item => <span className="block pl-3" key={item}>• {item}</span>)}</span>}
    {details?.map(item => <span className="block" key={item}>{item}</span>)}
    <span className="block font-medium text-destructive">Esta ação não pode ser desfeita.</span>
  </span>;
}

export function DeletionConfirmationDialog() {
  const request = useSyncExternalStore(subscribeDeletion, getPendingDeletion, () => null);
  const { pathname } = useLocation();
  const { user } = useAuth();
  useEffect(() => () => resolveDeletion(false), [pathname, user?.id]);
  return <AlertDialog open={!!request} onOpenChange={open => { if (!open) resolveDeletion(false); }}>
    <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>Confirmar exclusão definitiva</AlertDialogTitle>
        <AlertDialogDescription>{request && <DeletionSummary {...request} />}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => resolveDeletion(false)}>Cancelar</AlertDialogCancel>
        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => resolveDeletion(true)}>Excluir permanentemente</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}