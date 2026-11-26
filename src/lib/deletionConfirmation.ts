export interface DeletionConfirmation {
  itemName: string;
  removed: readonly string[];
  preserved?: readonly string[];
  details?: readonly string[];
}

interface PendingDeletion extends DeletionConfirmation {
  resolve: (confirmed: boolean) => void;
}

let pending: PendingDeletion | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const getPendingDeletion = () => pending;
export const subscribeDeletion = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// A second click must not replace the item the user is currently reviewing.
export function confirmDeletion(options: DeletionConfirmation): Promise<boolean> {
  if (pending || !options.itemName.trim() || options.removed.length === 0) return Promise.resolve(false);
  return new Promise(resolve => {
    pending = { ...options, resolve };
    emit();
  });
}

export function resolveDeletion(confirmed: boolean) {
  const request = pending;
  pending = null;
  emit();
  request?.resolve(confirmed);
}

export async function withDeletionConfirmation(options: DeletionConfirmation, action: () => unknown) {
  if (await confirmDeletion(options)) await action();
}