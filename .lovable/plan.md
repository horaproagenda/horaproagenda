
# Preço controlado pelo Stripe (fonte única da verdade)

Hoje os valores estão **fixos no código** em dois lugares (`src/lib/plans.ts` e `supabase/functions/create-checkout/index.ts`): `PER_SEAT_MONTHLY_BRL = 110`, os descontos semestral/anual e os três `price_id` do Stripe. Mudar o preço hoje exige editar código e publicar.

Objetivo: você altera no Stripe → app, Supabase e checkout passam a usar o novo valor automaticamente, sem deploy.

## Como funcionará

1. **Lookup keys no Stripe** (chave da solução). Preços no Stripe são imutáveis: para trocar o valor você cria um preço novo. Cada preço do Hora Pro recebe uma `lookup_key` fixa:
   - `horapro_seat_monthly`
   - `horapro_seat_semiannual`
   - `horapro_seat_annual`

   Ao criar o preço novo você marca "transfer lookup key" (a chave migra do preço antigo para o novo). O app nunca guarda `price_id` no código — ele resolve pela lookup key.

2. **Nova edge function `get-pricing`**: consulta o Stripe pelas 3 lookup keys e devolve `{ price_id, unit_amount, currency, interval_count }` de cada ciclo. Cache curto (60s) e gravação em uma tabela `pricing_cache` no Supabase (última leitura válida) para servir de fallback caso o Stripe falhe.

3. **Frontend**: novo hook `usePricing()` (React Query) substitui `PER_SEAT_MONTHLY_BRL`, `BILLING_PERIODS[].discount` e `BILLING_PRICE_IDS` nas telas de assinatura/landing. Os descontos deixam de ser fórmulas e passam a ser calculados comparando o preço do ciclo com 
`mensal × meses` — ou seja, os selos “-2%/-3%” se ajustam sozinhos ao novo valor.

4. **Checkout**: `create-checkout` e `create-pix-checkout` passam a resolver o `price_id` pela lookup key no momento da criação da sessão (Pix usa o `unit_amount` vindo do Stripe). Nada de valor fixo no servidor.

5. **Tempo real**: o `stripe-webhook` passa a tratar `price.created`, `price.updated` e `product.updated`, atualizando `pricing_cache`. O app assina essa tabela via Realtime e o preço na tela muda em segundos, sem recarregar.

6. **Assinaturas existentes**: mudar o preço no Stripe **não** altera automaticamente quem já assina (regra do Stripe). Duas opções — decido pela A se você não indicar outra:
   - **A (padrão)**: assinantes atuais continuam no preço antigo até trocarem de plano/renovarem manualmente pelo portal.
   - **B**: migração em massa dos assinantes para o novo preço (posso adicionar depois um botão no painel Super Admin).

## Detalhes técnicos

- Tabela `public.pricing_cache` (`lookup_key` PK, `price_id`, `unit_amount`, `currency`, `interval_months`, `updated_at`), com `GRANT SELECT` para `anon`/`authenticated` (preço é informação pública), `GRANT ALL` para `service_role`, RLS habilitado com política de leitura pública e escrita só via service role. Publicada no `supabase_realtime`.
- `src/lib/plans.ts` mantém os *seats* e helpers, mas os valores monetários passam a vir do hook; os fallbacks passam a ser os últimos valores conhecidos, não constantes de negócio.
- Validação de `ALLOWED_SEATS` continua no servidor, inalterada.
- Migração de dados: seed inicial do `pricing_cache` com os preços atuais na primeira execução de `get-pricing`.

## Passo manual seu (uma vez)

No Stripe, adicionar as três lookup keys aos preços atuais (`price_1Tuf4Z...`, `price_1Tuf5C...`, `price_1Tuf5X...`). Depois disso, toda mudança de valor é só criar preço novo transferindo a lookup key.
