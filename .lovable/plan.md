
## Objetivo

Mudar o modelo de cobrança das instâncias WhatsApp:
1. **Compra sob demanda**: nenhuma instância no pool é cobrada enquanto estiver "livre". A cobrança da instância só começa no momento em que ela é vinculada a um profissional.
2. **Faixas de desconto por volume**: o Super Admin configura preços por quantidade de instâncias **ativas (em uso)** — quanto mais instâncias em uso, menor o custo unitário.

> Observação: a UltraMsg não tem API pública para "comprar" instância programaticamente. O fluxo real continua sendo: admin cadastra instâncias no pool (sem custo até serem usadas), e o **billing only starts** quando o sistema atribui uma a um profissional. O custo exibido no painel reflete apenas instâncias em uso, aplicando a faixa de desconto vigente.

## Mudanças

### 1. Banco de dados (migration)

- `ultramsg_instance_pool`:
  - Nova coluna `activated_at TIMESTAMPTZ NULL` — preenchida quando a instância passa para `assigned`. É a partir dessa data que o sistema considera a instância sendo cobrada.
  - `monthly_cost_usd` deixa de ser o "preço fixo" — vira fallback caso não exista faixa configurada.

- Nova tabela `whatsapp_volume_pricing_tiers`:
  ```text
  id uuid pk
  min_quantity int  (ex: 1, 5, 10, 25)
  max_quantity int nullable  (null = "em diante")
  unit_price_usd numeric(10,2)
  active bool default true
  created_at, updated_at
  ```
  Grants para `authenticated` (leitura) e `service_role` (tudo). RLS: leitura para admin; escrita apenas admin via `has_role`.

- Função `claim_ultramsg_pool_instance` atualizada para também setar `activated_at = now()` quando faz claim.

- Trigger ao mudar status de `assigned` → `free`/`disabled`: limpa `activated_at` (encerra cobrança).

- Seed inicial das faixas:
  - 1–4 inst.: US$ 9,00
  - 5–9 inst.: US$ 8,00
  - 10–24 inst.: US$ 7,00
  - 25+ inst.: US$ 6,00

### 2. Painel Super Admin (`WhatsappPoolCostPanel.tsx`)

- Cards de custo passam a calcular usando faixa vigente baseada em **instâncias em uso (assigned)**:
  - "Custo mensal estimado": apenas `assigned` × `unit_price_usd` da faixa.
  - Remove card "pool inteiro" (já não faz sentido — pool ocioso não custa).
  - Card novo: "Faixa atual" mostrando ex.: "5–9 inst · US$ 8,00/unid".

- Nova seção colapsável **"Faixas de desconto"**:
  - Tabela editável (min_qty, max_qty, preço, ativo) com Add/Edit/Delete.
  - Botão "Restaurar padrão" reseta para o seed.

- Lista de instâncias mostra `activated_at` ("em uso desde dd/mm/yyyy") nas atribuídas.

- Texto explicativo atualizado: "Instâncias livres não geram custo. Cobrança inicia quando vinculadas a um profissional."

### 3. Edge function `whatsapp-claim-pool-instance`

- Sem mudança de lógica de negócio — a função RPC já cuidará do `activated_at`. Apenas garantir que a resposta retorne o timestamp.

### 4. UI lateral (não-admin)

- Nenhum cliente final vê esse custo. Já está oculto.

## Detalhes técnicos

- O cálculo de "qual faixa aplicar" roda no client (painel) e numa RPC `get_whatsapp_unit_price(qty int) returns numeric` para ser reaproveitada por relatórios futuros.
- Realtime: assinar `ultramsg_instance_pool` e `whatsapp_volume_pricing_tiers` para o painel atualizar sem refresh.
- Conversão USD→BRL continua via `localStorage` (`super-admin:usd-brl-rate`).

## Fora do escopo

- Compra automática real na UltraMsg (sem API pública). Admin segue adicionando instâncias manualmente — só que agora não há custo até o uso.
- Histórico de cobrança mês a mês (poderia ser próximo passo se você quiser fatura mensal por profissional).
