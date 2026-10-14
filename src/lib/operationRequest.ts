/** Identity and payment timestamps are server-owned, not request identity. */
export function canonicalOperationPayload(input: Record<string, unknown>): string {
  const serverFields = new Set(['created_by', 'updated_by', 'paid_by', 'paid_at', 'account_owner_id', 'professional_id', 'final_amount']);
  return JSON.stringify(Object.fromEntries(
    Object.entries(input).filter(([key]) => !serverFields.has(key)).sort(([a], [b]) => a.localeCompare(b)),
  );
}