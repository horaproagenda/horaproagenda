# Documentos: versão congelada, campos por identificador, validação no servidor e trilha de eventos

## Como o sistema funciona hoje
- Os modelos do Hora Pro são textos formatados (não PDFs com campos editáveis). O PDF é gerado a partir do documento já preenchido.
- O link enviado ao cliente busca o modelo **atual** na hora em que é aberto. Se o modelo for editado depois do envio, o cliente preenche uma versão diferente da que foi enviada. Isso também pode trocar respostas de lugar.
- As respostas já são salvas por identificador (correção anterior), mas o servidor aceita o envio sem conferir se cada campo existe no modelo.
- Não existe registro de eventos do documento (criado, prévia, validado, assinado).

Como os modelos não são PDFs com campos posicionados, a parte do arquivo sobre coordenadas, CropBox e rotação não se aplica. O restante será feito com o mesmo objetivo.

## O que será feito

### 1. Versão do modelo congelada em cada link
- Ao gerar o link, o sistema guarda uma cópia exata do modelo (texto, título e lista de campos) e o número da versão.
- Os modelos passam a ter um número de versão, que aumenta a cada edição.
- O cliente sempre preenche a versão registrada no link, nunca a versão atual. Documentos antigos nunca são refeitos com um modelo novo.
- Links antigos sem cópia guardada continuam funcionando com o modelo atual (comportamento de hoje).

### 2. Campos com identificador único e permanente
- Na hora de gerar o link, o sistema monta a lista oficial de campos (identificador, nome da pergunta, tipo, obrigatório).
- O link é recusado se o modelo tiver campos duplicados.

### 3. Envio no formato `{identificador, valor}`
- A página do cliente envia uma lista de pares identificador/valor e a versão do modelo usada.

### 4. Validação no servidor antes de salvar
O servidor recusa o envio se:
- algum identificador não pertencer ao modelo do link;
- houver identificador repetido;
- faltar uma resposta obrigatória;
- a versão enviada for diferente da versão do link.
O cliente vê uma mensagem clara, sem códigos.

### 5. Prévia com marca d'água
- Antes de enviar, o cliente vê a prévia com a faixa "PRÉVIA — NÃO ASSINADO".
- O documento salvo é exatamente o que aparece na prévia (sem a marca), congelado. Depois disso o PDF nunca é refeito a partir do formulário.

### 6. Registro de eventos do documento
Nova tabela de eventos, visível só para a conta dona do documento, com: link criado, link aberto, prévia gerada, prévia validada, envio recusado (com o motivo), documento enviado/finalizado. Isso permite descobrir onde um erro aconteceu.

### 7. Testes automáticos
- Campo desconhecido, campo repetido, campo obrigatório vazio e versão diferente são recusados.
- Modelo editado depois do envio do link não muda o que o cliente vê.
- Cada resposta aparece no campo esperado no documento final.

## Detalhes técnicos
- `document_templates`: nova coluna `version int default 1`, aumentada por gatilho quando `content` muda.
- `document_fill_links`: novas colunas `template_version int`, `template_snapshot jsonb` (título, conteúdo, campos). Preenchidas quando o link é criado (gatilho), então os pontos que já criam links não precisam mudar.
- `get_document_fill_link_by_token`: retorna o modelo do snapshot quando existir.
- `submit_document_fill_by_token`: aceita `p_fields jsonb` (lista `{field_id, value}`) e `p_template_version`; valida contra `template_snapshot.fields`; grava os valores em `filled_variables` por identificador. Mantém compatibilidade com o formato atual para links sem snapshot.
- Nova tabela `document_events` (id, link_id, account_owner_id, event_type, payload jsonb, created_at) com GRANTs e RLS por `account_owner_id`; escrita só por funções do servidor.
- Lista de campos montada pelo helper já existente `listDocumentFields`, gravada no snapshot a partir do app ao criar o link (o gatilho grava título/conteúdo/versão; o app acrescenta os campos).
- Marca d'água só na prévia em tela; o conteúdo salvo não leva a marca.
