// Cada bandeira existe em duas versões independentes: "<Bandeira> - Crédito" e
// "<Bandeira> - Débito", cada uma com as próprias taxas.
export type CardKind = 'credit' | 'debit';

export const CARD_KIND_SUFFIX: Record<CardKind, string> = {
  credit: ' - Crédito',
  debit: ' - Débito',
};

const norm = (s: string) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Remove o sufixo " - Crédito"/" - Débito" do nome. */
export function baseBrandName(name: string): string {
  return name.replace(/\s*-\s*(cr[eé]dito|d[eé]bito)\s*$/i, '').trim();
}

export function variantName(base: string, kind: CardKind): string {
  return `${baseBrandName(base)}${CARD_KIND_SUFFIX[kind]}`;
}

interface BrandLike {
  id: string;
  name: string;
  type: string;
  fee_behavior?: string;
  split_fee?: boolean;
  is_active: boolean;
  fees?: { installment_number: number; fee_percentage: number }[];
}

export interface VariantPlan {
  renames: { id: string; name: string; type: CardKind }[];
  creates: {
    name: string;
    type: CardKind;
    is_active: boolean;
    fee_behavior: string;
    split_fee: boolean;
    fees: { installment_number: number; fee_percentage: number }[];
  }[];
}

/**
 * Planeja a separação: toda bandeira "Ambos" ou sem par vira a versão de
 * Crédito (mantendo as taxas) e ganha a versão de Débito (taxa à vista copiada).
 */
export function planCardBrandVariants(brands: BrandLike[]): VariantPlan {
  const plan: VariantPlan = { renames: [], creates: [] };
  const names = new Set(brands.map(b => norm(b.name)));

  for (const b of brands) {
    const kind: CardKind = b.type === 'debit' ? 'debit' : 'credit';
    const base = baseBrandName(b.name);
    const target = variantName(base, kind);
    if (b.name !== target || b.type !== kind) {
      if (!names.has(norm(target)) || norm(b.name) === norm(target)) {
        plan.renames.push({ id: b.id, name: target, type: kind });
        names.add(norm(target));
      }
    }
    const otherKind: CardKind = kind === 'credit' ? 'debit' : 'credit';
    const other = variantName(base, otherKind);
    if (!names.has(norm(other))) {
      const oneX = (b.fees || []).find(f => f.installment_number === 1);
      plan.creates.push({
        name: other,
        type: otherKind,
        is_active: b.is_active,
        fee_behavior: b.fee_behavior || 'deduct_from_provider',
        split_fee: !!b.split_fee,
        fees: otherKind === 'debit'
          ? [{ installment_number: 1, fee_percentage: oneX?.fee_percentage ?? 0 }]
          : [{ installment_number: 1, fee_percentage: 0 }],
      });
      names.add(norm(other));
    }
  }
  return plan;
}

/** Taxa aplicável: débito usa sempre a taxa à vista (1x). */
export function cardFeePercentage(
  brand: { type: string; fees?: { installment_number: number; fee_percentage: number }[] } | undefined,
  installments: number,
): number {
  if (!brand) return 0;
  const fees = brand.fees || [];
  const n = brand.type === 'debit' ? 1 : Math.max(1, installments || 1);
  const match = [...fees].sort((a, b) => b.installment_number - a.installment_number)
    .find(f => f.installment_number <= n);
  return Number(match?.fee_percentage || 0);
}
