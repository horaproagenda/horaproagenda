# Backend authority review

## Verified and implemented in this stage

- `useSingleSales` now calls `create_single_sale_atomic`: sale, redeemed service or package sessions, ledger and eligible exact stock movements share a PostgreSQL transaction. The function is invoker-security and retains installed RLS. Anonymous execution is revoked.
- `useCashTransactions` creation now calls `create_cash_transaction_atomic`. An insert guard derives author, tenant and professional from the session/register and refuses a closed register.
- Stable request IDs survive a failed attempt; server-owned identity, payment timestamp and derived final amount are removed from the submitted payload.
- The stock-on-appointment trigger skips stock already consumed by the linked sale; no appointment times or existing stock were changed.
- Settings writes now validate timezone, opening/closing order, positive slot interval and immutable tenant on the database path.
- Auth identity changes clear query/mutation caches and offline operations. Stale profile/role reads cannot repopulate the new session. Global mutation retries are disabled while legacy non-idempotent paths remain.

## Source/database evidence and unfinished scope

| Domain | Evidence read | Remaining work before declaring complete |
| --- | --- | --- |
| Sales | `useSingleSales.ts`, `SaleForm.tsx`, installed sales/cash triggers | Multi-item `SaleForm` still coordinates multiple frontend calls and compensating purge; migrate all payment variants with isolated authenticated tests |
| Ledger/cash | `useFinancialEntries.ts`, `useCashTransactions.ts`, RLS and payment-method trigger | Ledger edits/deletions and cash deletion remain direct; verify side effects, commissions, reversals and concurrency |
| Scheduling/packages | `useAppointments.ts`, installed package/session triggers | Status updates and post-update cleanup remain coordinated client-side; migrate without changing manual dates |
| Products | `useProducts.ts`, `useProductUsageRecords.ts`, `useProductDailyConsumption.ts`, installed grants | Usage lifecycle writes are RPC-only; manual consumption still performs separate consumption/stock calls; review catalog ownership and purchase update/delete |
| Documents/fichas | lifecycle architecture and installed application guard/policies | Verify snapshot creation/public validation, template edits and complete record/child lifecycle with isolated tests |
| Catalog/settings | `useBusinessSettings.ts`, visibility trigger, services/package templates shapes | Validate all business fields and concurrent writes; current settings guard covers a subset only |
| Users/security | `AuthContext.tsx`, RLS inventory, usage grants | Verify role-writing paths, action permissions, file access and all definer functions; RLS presence alone is not proof of isolation |
| Notifications/integrations | source inventory and scheduled job names | Verify reminder delivery/idempotency, WhatsApp, subscription lifecycle and automatic repair without production messages/charges |
| Sync/PWA/reports | `App.tsx`, `useRealtimeSync.ts`, offline queue/sync | Verify cross-device authenticated readback, pagination, every report and pending offline actions |

## Validation limits

- Public browser check: `/caixa` redirects to `/auth`, password input is visible, no page errors.
- Anonymous smoke checks refuse official sale and cash calls. No real data is created.
- Session/request/financial-destination/offline tests ran successfully; this does not prove authenticated transactional behavior.
- External Supabase reports `external_unmanaged`; no managed browser session or configured smoke test credentials are available. Do not request passwords in chat. End-to-end transactional, permission and multi-device tests require an isolated authenticated test environment.
- 292 Supabase linter findings predate these migrations; no new findings were reported. Existing findings include disabled leaked-password protection and privileged-function exposure and remain subject to the broader security review.
- No publication, customer rescheduling, test charges, messages or real stock deductions were performed.