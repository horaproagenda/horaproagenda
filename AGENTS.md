# Architecture Rules

- Receipt PDF summary positioning must use the pure `receiptPdfLayout` helper so spacing and page-break behavior remain regression-testable.- Document fill links freeze a template snapshot (content, version, field schema) at creation and clients submit `{field_id, value}` pairs validated by `submit_document_fill_validated`; never fill by position or from the live template, so edits never shift answers.
- Application records (fichas) lock once completed; corrections only via amend_application_record RPC creating a linked new record, so clinical history stays immutable.
- Appointment payment button/label comes only from getPaymentAction in src/lib/paymentAction.ts (package linkage first, step price second) so zero-price package steps never hide the package balance.
