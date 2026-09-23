# Uma única verificação de disponibilidade

Hoje cada tela calcula o conflito por conta própria (o formulário de novo agendamento, a repetição de agendamentos, a edição pelo perfil do cliente) enquanto o banco aplica a sua própria regra. Resultado: a tela pode dizer "livre" e o salvamento falhar, ou marcar conflito onde o banco aceitaria.

A partir daqui existe **uma só verificação**: a regra do banco. As telas passam a perguntar ao banco e mostrar exatamente a mesma resposta (e o mesmo texto) que o salvamento vai obter.

## O que muda para quem usa

- O aviso de horário ocupado na tela sempre corresponde ao que o sistema aceita ao salvar.
- A mensagem exibida é a mesma do banco: profissional ocupado, sala ocupada, equipamento em uso ou profissional ausente, com dia e horário do choque.
- Sugestão de horário livre e avisos de fora do expediente/dia não atendido continuam funcionando.

## Como será feito

1. **Banco** — nova função que verifica vários horários numa só consulta, reaproveitando `appointment_conflict_reason` (a mesma regra usada pelo gatilho que bloqueia o salvamento). Permissão de execução para usuários autenticados.
2. **Novo arquivo `src/lib/availabilityCheck.ts`** — `checkAvailabilitySlots()` chama essa função e devolve o motivo (ou nada) por horário; hook `useAvailabilityCheck` com cache curto para uso nas telas.
3. **`NewAppointmentDialog`** — remove o cálculo local de conflito de profissional/sala/ausência. O horário principal e todas as datas da pré-visualização (pacote e série de serviços) são checados em uma chamada; as regras que são só do formulário (fora do expediente, dia não atendido, choque entre sessões da própria série) continuam locais.
4. **`RecurringAppointmentOptions`** — mantém a mesma interface, mas recebe do formulário os motivos vindos do banco.
5. **`EditAppointmentDialog`** — troca a consulta manual de sobreposição pela mesma verificação.
6. **`create-appointment`** — a verificação deixa de ser ignorada no modo antigo (`legacy`), passando a valer sempre.
7. **Testes** — novo teste de regressão garantindo que nenhuma tela calcule conflito de profissional/sala/equipamento localmente e que a verificação usada seja a do banco.
