import { parseISO, isBefore, startOfDay } from 'date-fns';
import type { Product } from '@/hooks/useProducts';

export function isProductExpired(product: Product): boolean {
  if (!product.expiry_date) return false;
  const expiry = startOfDay(parseISO(product.expiry_date + 'T00:00:00'));
  const today = startOfDay(new Date());
  return isBefore(expiry, today) || expiry.getTime() === today.getTime();
}

export function getExpiryStatus(product: Product): {
  expired: boolean;
  expiringToday: boolean;
  expiringSoon: boolean;
  daysUntil: number | null;
} {
  if (!product.expiry_date) {
    return { expired: false, expiringToday: false, expiringSoon: false, daysUntil: null };
  }
  const expiry = startOfDay(parseISO(product.expiry_date + 'T00:00:00'));
  const today = startOfDay(new Date());
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return {
    expired: diff < 0,
    expiringToday: diff === 0,
    expiringSoon: diff > 0 && diff <= 7,
    daysUntil: diff,
  };
}
