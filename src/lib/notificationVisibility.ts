/**
 * Privacidade das notificações do sistema.
 *
 * Regra protegida: cada aviso só chega a quem tem acesso àquela área.
 * Financeiro só para quem pode ver o Financeiro, caixa só para quem pode ver o
 * Caixa, produtos só para quem enxerga aquele estoque e lembretes só para quem
 * criou o lembrete (Administrador e recepção continuam vendo a equipe).
 *
 * Esta é a camada de interface; o banco continua aplicando RLS.
 */
import type { PermissionModuleKey } from '@/lib/permissions';

export type NotificationKind =
  | 'boleto'
  | 'package'
  | 'stock'
  | 'usage_prediction'
  | 'expiry'
  | 'reminder'
  | 'cash_register';

/** Área do sistema responsável por cada tipo de aviso. */
export const NOTIFICATION_MODULE: Record<NotificationKind, PermissionModuleKey> = {
  boleto: 'financeiro',
  package: 'servicos',
  stock: 'produtos',
  usage_prediction: 'produtos',
  expiry: 'produtos',
  reminder: 'lembretes',
  cash_register: 'caixa',
};

export function notificationModule(type: NotificationKind): PermissionModuleKey {
  return NOTIFICATION_MODULE[type];
}

/** Pode receber avisos deste tipo? */
export function canReceiveNotification(
  type: NotificationKind,
  can: (module: PermissionModuleKey, action: 'view') => boolean,
): boolean {
  return can(notificationModule(type), 'view');
}

export function filterNotificationsByAccess<T extends { type: NotificationKind }>(
  notifications: T[],
  can: (module: PermissionModuleKey, action: 'view') => boolean,
): T[] {
  return notifications.filter((n) => canReceiveNotification(n.type, can));
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Selo discreto de data e hora do aviso: "hoje 14:32" ou "08/09 14:00".
 * Serve apenas para situar o usuário no tempo, sem revelar nada do conteúdo.
 */
export function notificationTimeLabel(
  at: Date | string | undefined,
  now: Date = new Date(),
): string {
  if (!at) return '';
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `hoje ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

/**
 * Converte uma data isolada (ex.: vencimento "2026-09-08") em Date local,
 * evitando o deslocamento de fuso do parse ISO puro.
 */
export function dateOnlyToLocal(value?: string | null, time?: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const [hh, mm] = (time || '00:00').slice(0, 5).split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
