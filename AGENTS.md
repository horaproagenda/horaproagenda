# Architecture Rules

- Appointment package membership is proven only by explicit session IDs; standalone origin cannot be converted by heuristics, and batch scheduling inserts the exact session link before synchronization. Display numbering is separate from immutable template step identity to preserve procedures during historical corrections.

- Backend operations own definitive business transitions; frontend validation and cache are advisory only, because retries and concurrent devices must obey the same database rules.
- Single-item cash sales use create_single_sale_atomic with a stable request ID and invoker RLS; sales, bookable inventory, ledger and exact stock deductions commit together so failures cannot leave partial sales.
- Multi-item checkout uses create_multi_item_sale_atomic with invoker RLS and a basket request identity; catalog prices, payment fees, item-linked ledger, deferred installments, credit and stock commit together rather than browser compensation.
- Package price/name guards validate only new or changed values, and application quantity guards allow incomplete drafts but reject invalid supplied amounts; unrelated edits must not rewrite legacy records or appointment times.
- Cash transaction creation uses create_cash_transaction_atomic and an insert guard deriving register ownership/status server-side; direct callers cannot select a different professional or a closed register.
- Database settings guards validate business invariants on every write while retaining invoker RLS; frontend formatting is not authoritative.
- Clear query/mutation caches on authenticated identity changes and reject stale profile responses; never automatically retry mutations globally because non-idempotent legacy paths still exist.

- Product usage lifecycle uses product_usage_records and transactional lifecycle RPCs as its sole authority; purchases/products are read mirrors so manual dates, version checks and stock movements cannot diverge.
- Manual daily consumption uses permission-checked atomic record/cancel RPCs with request IDs and audited stock quantities; persisted cycle consumption alone supplies historical per-service statistics so current links cannot redistribute prior usage.

- Receipt PDF summary positioning must use the pure `receiptPdfLayout` helper so spacing and page-break behavior remain regression-testable.- Document fill links freeze a template snapshot (content, version, field schema) at creation and clients submit `{field_id, value}` pairs validated by `submit_document_fill_validated`; never fill by position or from the live template, so edits never shift answers.
- Application records (fichas) lock once completed; corrections only via amend_application_record RPC creating a linked new record, so clinical history stays immutable.
- Application editors save records, items and field values through save_application_record_atomic with a stable draft ID and optimistic version; clinic-local dates and template snapshots are resolved on the server to prevent partial writes and device-dependent history.
- Application editor geometry follows visualViewport directly, with one field scroller and separate action footer; never subtract keyboard height again from the measured visible height.
- Payables desktop tables use a bounded fluid container and stable vertical scrollbar gutter, not content-sized nested horizontal scrollers, to avoid resize feedback while preserving the shared Table component.
- Appointment payment button/label comes only from getPaymentAction in src/lib/paymentAction.ts (package linkage first, step price second) so zero-price package steps never hide the package balance.
- Package 'paid' state and payment method come from financial_entries (resolvePackagePayment in src/lib/packageLedger.ts); session amount_paid without a ledger entry is flagged, never counted.
- Sequential package session changes go through process_package_session_operation (row lock, idempotency key, package_audit_logs in the same transaction) and touch only the requested session; DB triggers enforce one active row per step, the contracted session limit and reason-gated reopen, so no client path can shift or duplicate sessions.
