# Incluir status na edição e corrigir o símbolo de Créditos

## Objetivo
Garantir que os dois botões **Editar** do perfil do cliente — em **Histórico Detalhado** e em **Agenda** — abram o formulário com o status atual e permitam alterá-lo. Corrigir também o símbolo da aba **Créditos** em iPhones.

## Implementação
1. **Status no formulário compartilhado de edição**
   - Incluir o campo **Status** no `EditRecurringAppointmentDialog`, que é o formulário usado pelos dois pontos do perfil do cliente.
   - Inicializar o campo com o status atual do agendamento e oferecer os estados oficiais já usados no sistema: Agendado, Confirmado, Atendido, Cancelado, Faltou e Reagendado.
   - Enviar o status junto com data, horário, profissional e sala ao salvar, sem alterar os demais agendamentos da série quando somente o registro aberto estiver sendo editado.
   - Preservar as regras existentes de pacotes e séries, inclusive bloqueio de edição concorrente e atualização imediata da Agenda e do Histórico.

2. **Símbolo de Créditos no iPhone**
   - Substituir o desenho atual de cartão da aba **Créditos** por um símbolo de créditos da mesma biblioteca dos demais ícones, com tamanho e largura explicitamente preservados.
   - Manter o mesmo alinhamento, cor e comportamento das sete abas, evitando que o Safari do iPhone comprima ou oculte apenas esse símbolo.

3. **Proteção contra regressões**
   - Adicionar testes que confirmem que o formulário carrega e salva o status selecionado nos dois acessos do perfil.
   - Adicionar verificação estrutural da aba Créditos para garantir que ela sempre renderize um símbolo visível.
   - Validar o perfil em largura de iPhone e conferir abertura, alteração e salvamento do status.

## Situação confirmada no código
- **Histórico Detalhado** e **Agenda** do perfil encaminham o agendamento ao mesmo `EditRecurringAppointmentDialog`.
- Esse formulário atualmente edita data, horários, profissional, sala e equipamentos, mas não possui estado nem campo de status.
- A aba **Créditos** já tenta renderizar um ícone `CreditCard`; a correção será feita apenas nessa aba, sem alterar os demais símbolos.
