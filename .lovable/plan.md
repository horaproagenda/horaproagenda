

# Plan: Documents Link Sharing + Products Flow Redesign

This is a large request with two major areas. Given the scope, I recommend splitting into two phases. Here is the complete plan:

---

## Phase 1: Document Link Sharing from Client Profile

### Current State
- `GenerateLinkDialog` already exists and works from the Documentos page (template-level)
- `PreencherDocumento.tsx` handles public document filling via token
- `document_fill_links` table + RPC functions (`get_document_fill_link_by_token`, `submit_document_fill_by_token`) already exist
- Client documents tab (`ClientDocumentsTab.tsx`) shows documents but has no "send by link" option

### Changes

**1. Add "Enviar por Link" button to each document in ClientDocumentsTab**
- For documents created from templates (have `template_id`), add a Link2 icon button
- Clicking opens `GenerateLinkDialog` pre-filled with the client and template
- The generated link is for manual copying (no auto-send)

**2. Enhance PreencherDocumento.tsx - Post-fill flow**
- After filling, show confirmation dialog: "Todas as informações foram preenchidas corretamente? Após confirmar, nenhuma alteração poderá ser feita."
- On confirm, generate a PDF (using jspdf already installed) of the filled document
- Show instructions: "Assine o PDF pelo Gov.br e envie de volta ao profissional"
- Provide a download button for the PDF
- When client revisits link after submitting: show "Documento já assinado" message (already partially done)

**3. Auto-fill client data (CPF, birthdate, name, age)**
- Update `get_document_fill_link_by_token` RPC to also return `client_cpf`
- In PreencherDocumento, auto-fill `{cpf}`, `{data_nascimento}`, `{nome}`, `{idade}` from client data

**4. Template enhancements - checkbox (X) and text box fields**
- In `DocumentTemplateDialog`, add instructions for template creators on how to add:
  - `( ) Sim ( ) Não` patterns for yes/no questions (already supported in fill page)
  - `[TEXTO_LIVRE]` pattern for open text boxes
- In `PreencherDocumento.tsx`, detect `[TEXTO_LIVRE]` or similar patterns and render a `Textarea` for free-form writing

### Database Migration
```sql
-- Update RPC to include CPF
CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
RETURNS TABLE(..., client_cpf text, client_phone text)
-- Add client_cpf from clients table
```

---

## Phase 2: Products Flow Redesign

### Current State
The "Novo Produto" dialog currently includes stock/pricing fields mixed with product info. The user wants a cleaner separation.

### Changes

**1. Simplify "Novo Produto" dialog** - Only these fields:
- Nome, Marca, Categoria, Tipo (sólido/líquido/creme/gel/pó/outro), Fornecedor, Para Venda (sim/não), Preço de Venda (if for sale)
- Remove: quantity, unit_price, total_price, purchase_date, expiry_date, started_using_at, current_stock, min_stock_alert from the creation form

**2. Add "Registrar no Estoque" button in ProductDetailDialog**
- New section/button in the Info tab
- Fields: Quantidade atual, Quantidade por pacote fechado, Valor total pago, Valor unitário (auto-calculated bidirectionally), Data da compra, Data validade, Alerta estoque mínimo
- For estimated products (gel/liquid): Data início de uso, Data fim de uso

**3. Restructure "Compras" button/dialog**
- Select product, Quantidade comprada, Preço unitário OR Preço total (bidirectional calc), Fornecedor, Data da compra
- Every purchase registers in Caixa + Financeiro (already partially done)

**4. Enhance ProductDetailDialog tabs**
- **Info tab**: Show stock atual, atendimentos realizados, tipo de produto, tipo de uso
- **Compras tab**: Purchase history with date, quantity, value, supplier, usage dates. Add Edit button for each purchase
- **Serviços tab**: Add multi-select to link multiple services at once. Fields: quantity per use, container amount, estimated appointments
- **Pacotes tab**: Add multi-select to link multiple packages at once. Same fields as services
- **Consumo tab**: Weekly consumption updated automatically (already partially exists)

**5. Global Edit button**
- In ProductDetailDialog, the Edit button should allow editing all information: general info, stock, purchases, service links, package links

**6. Ensure financial cascade**
- Every new purchase creates entries in cash_transactions and financial_entries (already partially implemented, verify consistency)

---

## Implementation Order
1. Phase 1 (Documents) - 4 files modified, 1 migration
2. Phase 2 (Products) - 2-3 files heavily modified (Produtos.tsx, ProductDetailDialog.tsx)

## Estimated Scope
- ~8 files to modify
- 1 database migration
- No new dependencies needed (jspdf already installed)

