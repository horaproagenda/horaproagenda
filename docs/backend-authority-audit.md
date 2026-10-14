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
| Sales | `useSingleSales.ts`, `SaleForm.tsx`, installed sales/cash triggers | Multi-item checkout now calls one invoker RPC; prices/fees, quantity, packages, installments, credit and stock are server-coordinated. Authenticated rollback/concurrency/payment-variant tests remain mandatory before declaring verified |
| Ledger/cash | `useFinancialEntries.ts`, `useCashTransactions.ts`, RLS and payment-method trigger | Ledger edits/deletions and cash deletion remain direct; verify side effects, commissions, reversals and concurrency |
| Scheduling/packages | `useAppointments.ts`, installed package/session triggers | Status updates and post-update cleanup remain coordinated client-side; migrate without changing manual dates |
| Products | `useProducts.ts`, `useProductUsageRecords.ts`, `useProductDailyConsumption.ts`, installed grants | Lifecycle/manual consumption use official RPCs; historical stats use persisted movements. Isolated authenticated cycle/concurrency tests and ambiguous legacy reconciliation remain pending |
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

## Continuation: multi-item checkout, packages and fichas

- `create_multi_item_sale_atomic` receives one stable basket request. Same request with different input is rejected; successful retries return persisted sales. The identity columns are protected against later edits.
- Uses invoker RLS, authenticated session/account derivation, item permissions and catalog prices. Prices are locked during checkout; stale payment totals reject the transaction. No anonymous execution or new definer function exposure.
- Each package quantity creates its own package, pending sessions and linked sale. No appointment dates/times are assigned or changed. Services create the purchased quantity of available items.
- Cash/ledger entries link to each sale; Boleto/Cheque remain pending, installments and reminders commit with checkout. Credit uses a locked client balance. Card fees are read from the official fee schedule. Net ledger uses gross receipt plus one fee expense rather than deducting the fee twice.
- Stock movements commit with checkout, respect active/planned reserves, exclude estimated/current-cycle deductions, validate units and identify each linked package sale. No frontend stock phase or compensating purge remains in `SaleForm`.
- Package name/price guards reject new/changed invalid values without blocking unrelated legacy edits; supplied application quantities must be positive/finite, while incomplete drafts remain allowed.
- Validation: 17 unit tests and one live anonymous-refusal smoke test passed. Browser `/caixa` redirected to `/auth`, password field present, zero page errors. Automatic compilation OK. These checks do not prove authenticated checkout, troco, credit concurrency, boleto readback or cross-account isolation.
- 294 database linter notices predated this continuation; no new ones. They remain a separate security review item, including password protection settings.
- Remaining modules and end-to-end checks are not declared complete. External Supabase has no managed authenticated isolated test session; do not request passwords or exercise financial writes on real records to fill this gap.