# Architecture Rules

- Product usage lifecycle uses product_usage_records and transactional lifecycle RPCs as its sole authority; purchases/products are read mirrors so manual dates, version checks and stock movements cannot diverge.

- Receipt PDF summary positioning must use the pure `receiptPdfLayout` helper so spacing and page-break behavior remain regression-testable.- Document fill links freeze a template snapshot (content, version, field schema) at creation and clients submit `{field_id, value}` pairs validated by `submit_document_fill_validated`; never fill by position or from the live template, so edits never shift answers.
- Application records (fichas) lock once completed; corrections only via amend_application_record RPC creating a linked new record, so clinical history stays immutable.
- Appointment payment button/label comes only from getPaymentAction in src/lib/paymentAction.ts (package linkage first, step price second) so zero-price package steps never hide the package balance.
- Package 'paid' state and payment method come from financial_entries (resolvePackagePayment in src/lib/packageLedger.ts); session amount_paid without a ledger entry is flagged, never counted.
