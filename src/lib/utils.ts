import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number to Brazilian currency format (R$ 1.234,56)
 */
export function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

/**
 * Format a number to Brazilian format without prefix (1.234,56)
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

export function parseBrazilianCurrency(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const sanitized = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!sanitized) return 0;

  const hasComma = sanitized.includes(',');
  const hasDot = sanitized.includes('.');

  if (hasComma) {
    return Number(sanitized.replace(/\./g, '').replace(',', '.')) || 0;
  }

  if (hasDot) {
    const parts = sanitized.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      return Number(sanitized.replace(/\./g, '')) || 0;
    }
  }

  return Number(sanitized) || 0;
}

export function formatCurrencyInput(value: number | string | null | undefined): string {
  const numericValue = typeof value === 'number' ? value : parseBrazilianCurrency(value);
  return numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
