# Corrigir o fluxo de pacote sequencial (agendamentos que desaparecem)

## O que está acontecendo (confirmado nos dados)

O registro de auditoria do banco mostra exatamente o problema relatado:

```text
26/08 21:52:53  criado o pacote sequencial "Corpo inteiro"
26/08 21:53:04  criado agendamento 19/08
26/08 21:53:06  criado agendamento 31/08
26/08 21:53:07  criado agendamento 21/09
26/08 21:53:08  criado agendamento 28/09
26/08 21:58:31  APAGADOS: os 4 agendamentos + o pacote (tudo de uma vez)
```

Cinco minutos depois de salvar, uma rotina automática de "integridade de vendas"
apagou o pacote e todos os agendamentos dele. Por isso eles aparecem no perfil da
cliente e depois somem, e por isso o horário volta a ficar livre na agenda.

Causa: a rotina automática considera "pacote órfão" qualquer pacote de cliente que
não tenha uma **venda no Caixa** vinculada, e apaga o pacote junto com todos os
agendamentos. Pacotes criados direto pelo formulário da agenda nunca têm venda no
Caixa — ou seja, todo pacote agendado pela agenda estava sendo apagado sozinho.

## Correções

1. **Parar a exclusão automática (correção principal)**
   - A rotina de limpeza deixa de apagar pacotes: passa a apagar somente pacotes
     realmente órfãos, ou seja, sem venda **e** sem nenhuma sessão/agendamento
     vinculado **e** criados há mais de 24 horas. Pacote com agendamento nunca é
     apagado automaticamente.
   - Remover a chamada automática de exclusão da verificação em segundo plano:
     divergências passam a ser apenas registradas, sem apagar dados (mesma regra
     já adotada para vendas fantasma).

2. **Confirmação real do agendamento antes de avisar sucesso**
   - Depois de criar as sessões, o formulário confere no banco quantos
     agendamentos daquele pacote realmente existem e só então informa o total.
   - Se algum não persistiu, a mensagem diz quais sessões faltaram, em linguagem
     simples, sem códigos.

3. **Vínculo garantido de cada sessão**
   - Cada agendamento criado é vinculado à sessão correspondente do pacote; se o
     vínculo falhar, o agendamento é revertido em vez de ficar solto (agendamento
     solto era o que fazia a rotina de limpeza enxergar "pacote sem sessões").

4. **Cores diferentes por serviço no formulário do pacote sequencial**
   - A paleta atual repete a mesma cor em várias posições (posições 1 e 2 são
     idênticas; 3, 5, 7 e 9 também). Substituir por uma paleta de tons realmente
     distintos, com contraste entre etapas vizinhas, mantendo os tokens do tema.

5. **Datas anteriores a hoje**
   - Verificar e garantir, ponta a ponta, que iniciar um pacote em data passada
     (ex.: 19/08/2026 às 18h) funciona para a primeira sessão e para as
     seguintes, sem erro de conflito ou de expediente.

6. **Intervalo entre etapas**
   - Conferir que o intervalo de cada etapa (dias após a etapa anterior) é o que
     manda no agendamento automático, inclusive quando uma sessão é empurrada por
     conflito, feriado ou dia não trabalhado.

## Testes e verificação

- Teste automatizado de regressão que falha se a rotina de limpeza voltar a apagar
  pacote com agendamento vinculado.
- Teste do cálculo da cadeia: 15 etapas com intervalos diferentes, começando em
  data passada, mantendo cada intervalo.
- Teste das cores: nenhum par de serviços distintos recebe a mesma cor.
- Verificação prática no app (navegador): criar pacote sequencial de 15 etapas para
  uma cliente iniciando em 19/08/2026 18:00, salvar, e confirmar que os 15
  agendamentos continuam existindo no perfil e aparecem na agenda depois de o ciclo
  de verificação em segundo plano rodar.
- Limpeza de dados: revisar se há pacotes/sessões inconsistentes deixados pelas
  exclusões anteriores; nenhum dado válido será apagado.

## Detalhes técnicos

- Migração no banco: reescrever `heal_orphan_service_packages()` com as condições
  restritivas acima; `hard_purge_service_package()` continua disponível apenas para
  o cancelamento manual em Pacotes/Financeiro.
- `src/hooks/useSaleFlowIntegrityAutoCheck.ts`: remover o auto-purge.
- `src/components/appointments/NewAppointmentDialog.tsx`: verificação pós-criação
  por consulta ao banco, vínculo com rollback e mensagens humanizadas.
- `src/lib/sequentialPackageColors.ts`: nova paleta sem repetições.
- Testes em `src/lib/__tests__/` e `src/__tests__/regression/`; documentar o
  comportamento protegido em `docs/protected-behaviors.md`.
