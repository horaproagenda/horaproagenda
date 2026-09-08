/**
 * Regra protegida: notificação só para quem tem acesso à área correspondente,
 * com selo discreto de data e hora.
 */
import { describe, it, expect } from 'vitest';
import {
  canReceiveNotification,
  filterNotificationsByAccess,
  notificationModule,
  notificationTimeLabel,
  dateOnlyToLocal,
} from '@/lib/notificationVisibility';

const only = (modules: string[]) => (m: string) => modules.includes(m);

describe('privacidade das notificações', () => {
  it('liga cada tipo de aviso à sua área', () => {
    expect(notificationModule('boleto')).toBe('financeiro');
    expect(notificationModule('cash_register')).toBe('caixa');
    expect(notificationModule('reminder')).toBe('lembretes');
    expect(notificationModule('stock')).toBe('produtos');
    expect(notificationModule('expiry')).toBe('produtos');
  });

  it('não entrega aviso financeiro a quem não vê o financeiro', () => {
    const can = only(['lembretes']) as never;
    expect(canReceiveNotification('boleto', can)).toBe(false);
    expect(canReceiveNotification('reminder', can)).toBe(true);
  });

  it('filtra a lista mantendo só o que o usuário pode ver', () => {
    const can = only(['produtos']) as never;
    const list = [
      { type: 'boleto' as const },
      { type: 'stock' as const },
      { type: 'cash_register' as const },
      { type: 'expiry' as const },
    ];
    expect(filterNotificationsByAccess(list, can).map(n => n.type)).toEqual(['stock', 'expiry']);
  });
});

describe('selo de data e hora', () => {
  it('usa "hoje" no mesmo dia', () => {
    const now = new Date(2026, 8, 8, 14, 32);
    expect(notificationTimeLabel(now, now)).toBe('hoje 14:32');
  });

  it('mostra dia/mês em outra data', () => {
    const now = new Date(2026, 8, 8, 14, 32);
    expect(notificationTimeLabel(new Date(2026, 8, 5, 9, 5), now)).toBe('05/09 09:05');
  });

  it('não desloca datas simples por fuso', () => {
    const d = dateOnlyToLocal('2026-09-08', '14:00')!;
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(14);
  });

  it('devolve vazio sem data', () => {
    expect(notificationTimeLabel(undefined)).toBe('');
  });
});
