# Produtos de uso geral (sem vínculo com atendimentos)

## O que muda para você
1. **No cadastro do produto**, um novo campo obrigatório: **"Como o produto é usado?"**
   - **Usado em atendimentos** (como hoje: ligado a serviços/pacotes, conta atendimentos).
   - **Uso geral** (limpeza, café, copos etc.): não liga a serviços, não conta atendimentos.
2. **Para produtos de uso geral**, ao iniciar o uso você informa:
   - Data de início de uso e quantidade em uso.
   - **Duração média (dias) — opcional**, se já souber. Se deixar em branco, o app calcula sozinho a média com base nos ciclos já terminados.
   - Ao terminar, informa a **data de término**; o app grava a duração real (dias contados de forma inclusiva) e atualiza a média.
3. **Nos detalhes do produto de uso geral**: aparecem início, quantidade, previsão de término (pela média informada ou calculada), duração média e histórico de ciclos. Somem os cards de "atendimentos realizados" e "consumo por serviço".
4. **Lista de produtos**: filtro novo "Tipo de uso" (Atendimentos / Uso geral) e um selo no produto.
5. **Produtos atuais**: todos continuam como "Usado em atendimentos", exceto os que não têm nenhum serviço ou pacote vinculado nem uso em atendimentos, que viram "Uso geral" automaticamente. Você pode trocar a qualquer momento no cadastro.

## Regras
- Produto de uso geral não pode ser vinculado a serviço/pacote nem consumido em atendimento/ficha (bloqueado no banco, com aviso claro).
- Trocar para "Uso geral" só é permitido se não houver vínculos ativos com serviços/pacotes.
- Datas só (sem horário), regras de correção com motivo continuam iguais.
- Ciclos antigos e estoque não são alterados.

## Detalhes técnicos
- Migração: `products.usage_scope text not null default 'appointments'` (`appointments`|`general`) e `products.expected_duration_days int null` (1–3650), validados por trigger; backfill para `general` só onde não há `service_products`, `package_template_products` nem consumo em atendimento.
- Triggers em `service_products`/`package_template_products`/consumo em atendimento rejeitam produto `general`.
- Média calculada: duração média dos `product_usage_records` concluídos; previsão = início + (média informada ou calculada) − 1.
- `finish_product_usage_record` já grava uso sem `service_id` para produtos sem vínculo; mantido.
- Frontend: formulário de produto (campo de tipo + duração média), `ProductDetailDialog` oculta estatísticas de atendimento para `general`, filtro em `Produtos.tsx`; helper puro `generalUsageForecast.ts` com testes (média, previsão, dias inclusivos).
