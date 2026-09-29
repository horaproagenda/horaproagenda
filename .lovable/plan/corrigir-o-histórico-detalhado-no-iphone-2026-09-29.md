# Corrigir o Histórico Detalhado no iPhone

## Diagnóstico confirmado

A falha não está em uma única propriedade; ela resulta da combinação de quatro comportamentos:

1. **O Histórico Detalhado ainda usa a tabela larga tradicional no celular.** Em `ClientReportTab.tsx:583-684`, essa seção usa `Table`, enquanto outras listas do mesmo arquivo já usam `ResponsiveTable`. As sete colunas têm larguras mínimas e conteúdos sem quebra, portanto excedem naturalmente a largura do iPhone.
2. **Existem duas áreas de rolagem encaixadas.** A div externa em `ClientReportTab.tsx:583` controla a rolagem vertical e esconde o excesso horizontal; o próprio `Table` cria outro contêiner horizontal em `table.tsx:68-80`. No Safari móvel, essa combinação com rolagem por impulso cria camadas de composição concorrentes.
3. **A regra global fixa a primeira coluna de toda tabela móvel.** `index.css:1781-1789` aplica `position: sticky; left: 0` à primeira célula. Ao mesmo tempo, `index.css:1361-1377` fixa o cabeçalho. No iPhone, a interseção de cabeçalho fixo, primeira coluna fixa e rolagens encaixadas faz a primeira coluna ser desenhada sobre as demais. Remover apenas o desfoque não remove essas camadas fixas.
4. **O botão Editar fica focado na última coluna.** Ele abre a janela em `ClientReportTab.tsx:659-663`. O diálogo é controlado, sem `DialogTrigger`, e atualmente cancela tanto o foco de abertura quanto o de fechamento em `EditRecurringAppointmentDialog.tsx:377`. Ao impedir o foco de entrada, o botão Editar atrás da janela pode continuar como elemento ativo. Quando a janela fecha e o Safari recompõe a página, ele volta a enquadrar esse botão focado, restaurando a área horizontal à direita. Impedir somente o foco automático do Radix não impede esse enquadramento nativo do Safari.

As correções anteriores trataram sintomas isolados, mas mantiveram a tabela larga, as duas rolagens, as células fixas e o foco no botão da última coluna.

## Solução proposta

### 1. Usar a apresentação responsiva já adotada pelo aplicativo

Converter **somente o Histórico Detalhado** para `ResponsiveTable`:

- celular e tablet: cada agendamento vira um cartão, sem rolagem lateral;
- computador: permanece uma tabela com as mesmas sete colunas;
- preservar nomes, datas, profissional, aplicação, status, cores e ações;
- manter a altura e a rolagem vertical da lista sem criar uma segunda rolagem horizontal.

Isso remove no iPhone a combinação que causa a sobreposição: tabela larga + primeira coluna fixa + cabeçalho fixo + rolagens encaixadas.

### 2. Corrigir o ciclo de foco da janela

- Antes de abrir a edição, retirar explicitamente o foco do botão acionado.
- Permitir que a janela receba um foco interno seguro ao abrir, em vez de manter o botão da coluna Ações ativo atrás dela.
- Ao fechar, impedir que o navegador tente reenquadrar horizontalmente o antigo botão.
- Não alterar o componente global `Table` nem o comportamento das outras tabelas.

### 3. Proteção contra regressão

Adicionar testes específicos para o Histórico Detalhado:

- em 390 px e 900 px, renderiza cartões e não cria área horizontal;
- em desktop, continua exibindo a tabela completa;
- abrir e fechar Editar não deixa o botão da coluna Ações focado;
- a posição vertical da lista permanece estável;
- nenhuma regra global ou `src/components/ui/table.tsx` é alterada.

## Arquivos previstos

- `src/components/client-profile/ClientReportTab.tsx`
- `src/components/appointments/EditRecurringAppointmentDialog.tsx`
- teste de regressão específico do Histórico Detalhado

`src/components/ui/table.tsx`, outras tabelas e regras globais de tabelas permanecerão intactos.
