export type ReceiptRow = { item: string; type: string; quantity: number; unitPrice: number; total: number };

export type ReceiptExtraItem = {
  item_type: 'service' | 'product' | string;
  service_id?: string | null;
  product_id?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  total_amount?: number | string | null;
  service?: { name?: string | null } | null;
  product?: { name?: string | null } | null;
};

/**
 * Linhas do recibo: serviço principal + todos os itens adicionais (gravados e
 * ainda não gravados). Nome é resolvido pelo catálogo quando a junção não vem,
 * e o total nunca fica zerado quando há preço unitário e quantidade.
 */
export function buildReceiptRows(params: {
  main: ReceiptRow;
  persisted: ReceiptExtraItem[];
  pending: ReceiptExtraItem[];
  nameLookup: (type: string, id: string | null | undefined) => string | undefined;
}): ReceiptRow[] {
  const toRow = (it: ReceiptExtraItem): ReceiptRow => {
    const quantity = Number(it.quantity || 0) || 1;
    const unitPrice = Number(it.unit_price || 0);
    const stored = Number(it.total_amount || 0);
    const total = stored > 0 ? stored : quantity * unitPrice;
    const id = it.item_type === 'service' ? it.service_id : it.product_id;
    const name = it.service?.name || it.product?.name || params.nameLookup(it.item_type, id)
      || (it.item_type === 'service' ? 'Serviço adicional' : 'Produto adicional');
    return {
      item: name,
      type: it.item_type === 'service' ? 'Serviço adicional' : 'Produto',
      quantity,
      unitPrice: unitPrice > 0 ? unitPrice : total / quantity,
      total,
    };
  };
  return [params.main, ...params.persisted.map(toRow), ...params.pending.map(toRow)];
}
