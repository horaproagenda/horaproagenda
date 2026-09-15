# Corrigir os espaços no topo e o corte do menu no iPhone

## Causas confirmadas

1. **Espaço no topo com e sem período gratuito:** a estrutura do aviso sempre é criada, mesmo quando `TrialBanner` não mostra conteúdo. Esse recipiente vazio ainda reserva a área do notch. Quando o aviso existe, ele também reserva essa área; depois, o cabeçalho da Agenda reserva a mesma área novamente. Assim, o espaço superior é duplicado nos dois acessos mostrados.
2. **Corte na parte inferior do menu:** no celular, o menu lateral recebe `role="dialog"`. Por isso, a regra global que reduz a altura de janelas também reduz o menu, embora ele devesse ocupar toda a altura visível. A diferença aparece como a faixa cortada marcada na imagem.

## Correção

### 1. Uma única estrutura vertical no aplicativo
- Organizar aviso opcional + aplicativo em uma única coluna limitada à altura realmente visível do iPhone/Android.
- Reservar a área do notch/status apenas uma vez: no aviso quando ele estiver visível; caso contrário, no cabeçalho.
- Não criar o recipiente do aviso quando a assinatura ativa não tiver mensagem para mostrar.
- Remover o desconto indireto de altura que hoje depende de um recipiente externo vazio, evitando lacunas durante carregamento, troca de conta e atualização da assinatura.

### 2. Menu lateral até o fim da tela
- Identificar explicitamente o menu principal para excluí-lo da limitação global aplicada às janelas e formulários.
- Fazer o menu usar toda a altura visual disponível, incluindo apenas as áreas seguras necessárias no topo e embaixo.
- Manter a lista central rolável quando o aparelho tiver pouca altura, sem comprimir nem cortar usuário, versão ou botão de saída.

### 3. Proteção contra retorno do erro
- Atualizar os testes para cobrir conta com período gratuito, conta ativa sem aviso e menu aberto no celular.
- Garantir por teste que o notch seja contado uma única vez, que nenhum recipiente vazio seja renderizado e que a regra de janelas não alcance o menu.
- Validar visualmente no formato do iPhone 16, com e sem aviso, e em uma tela Android estreita, incluindo menu aberto e fechado.

## Limites

- Alterações somente no enquadramento visual e nos testes relacionados.
- Nenhuma mudança em assinatura, cobrança, permissões, agenda ou dados.