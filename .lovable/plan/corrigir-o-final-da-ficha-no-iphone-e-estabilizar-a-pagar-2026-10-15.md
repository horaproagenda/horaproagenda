# Corrigir o final da ficha no iPhone e estabilizar A Pagar

## Diagnóstico verificado

- **Nova ficha:** o corte ocorre mesmo sem teclado, conforme informado. O formulário atual coloca todos os campos e os botões de salvar/finalizar dentro da mesma área rolável. A janela lateral combina altura total, altura máxima dinâmica e espaçamento das áreas seguras. Essa estrutura precisa ser validada no navegador para identificar exatamente o que impede alcançar o final; a causa específica do corte ainda não foi reproduzida.
- **A Pagar:** a compactação atual usa um contêiner que encolhe ao conteúdo (`md:w-fit`), tabela de largura automática, colunas estreitas e títulos/botões de 11px. Isso explica a apresentação pequena. A tabela compartilhada mede a largura e acrescenta uma barra superior quando há excesso de conteúdo; a combinação com as áreas de rolagem externas pode provocar oscilações, mas essa hipótese precisa de reprodução antes de ser tratada como causa confirmada.

## 1. Nova ficha preenchível no iPhone

- Reproduzir a abertura e a rolagem até o último campo sem teclado, com teclado e após fechá-lo.
- Organizar a janela em três áreas: título, campos com uma única rolagem interna e rodapé de ações fora dessa rolagem.
- Ajustar a altura à área visível e reservar espaço para a barra inferior do iPhone, sem descontar o teclado duas vezes.
- Manter o último campo completamente alcançável e os botões **Salvar rascunho** e **Finalizar ficha** acessíveis, sem cobrir campos.
- Preservar todos os campos, fontes de pelo menos 16px nos controles, balões e filtros empilhados. Conferir também no Motorola.

## 2. A Pagar estável e legível no notebook

- Reproduzir a tremedeira com lista curta, lista longa, filtros e seleção de pagamentos, medindo mudanças repetidas de largura/altura após a tela estabilizar.
- Substituir a largura que encolhe ao conteúdo por uma área de largura previsível, limitada ao espaço disponível.
- Evitar áreas horizontais de rolagem concorrentes e reservar espaço estável para a rolagem vertical quando necessário.
- Redistribuir as colunas: descrição com espaço confortável, data/valor/status/ações alinhados e próximos, sem voltar aos grandes vazios anteriores.
- Aumentar a legibilidade dos textos e botões; compacto deve significar menos espaço desperdiçado, não informações minúsculas.
- Manter os cartões no celular e o nome da conta visível.

## 3. Validação e proteção contra regressão

- Testar a ficha em tamanhos de iPhone e Motorola: abrir, preencher o último campo, acrescentar itens, rolar até o final e acionar salvar. Verificar que os controles permanecem dentro da área visível.
- Testar A Pagar em notebook, incluindo 1366×768 e janela menor: filtros, rolagem e seleção sem mudanças contínuas de tamanho, textos sobrepostos ou ações inacessíveis.
- Acrescentar testes de interação/medição para alcance do último campo e estabilidade da tabela; manter os testes existentes de gravação das fichas e consolidação dos pagamentos.
- Não criar nem dar baixa em pagamentos reais para testar. A reprodução isolada poderá usar dados de teste, com essa limitação declarada.
- A verificação autenticada na conta não está disponível por sessão gerenciada neste projeto. Safari no iPhone real continua necessário para confirmar o comportamento específico do aparelho; não apresentar simulação como validação real.

## Escopo técnico

- Concentrar as alterações no editor de `ClientApplicationsTab.tsx` e na apresentação de `ContasAPagar.tsx`, com testes próximos aos existentes.
- **Não alterar `src/components/ui/table.tsx`.** Corrigir os contêineres de A Pagar sem modificar a tabela compartilhada.
- Não alterar valores, baixas, categorias, estoque, horários, permissões ou registros existentes.
- A gravação das fichas continua pela operação atômica já usada no servidor. Estas correções são de apresentação e não exigem migração de banco nem mudança nas regras financeiras.
- Não publicar automaticamente.