# Cenários de Teste — Agenda Completa

Documento vivo descrevendo cenários de validação manuais/automatizáveis para
todas as funções da Agenda. Os itens marcados com ✅ já possuem cobertura
automatizada (vitest). Os demais são roteiros para QA manual ou Playwright E2E.

## 1. Slots e visualização (✅ unit)
- ✅ `mergeAgendaTimeSlots` adiciona horários de agendamentos fora dos slots base
- ✅ inclui horários de ausências
- ✅ ignora agendamentos com status `rescheduled`
- ✅ retorna lista ordenada e sem duplicatas
- [QA] Visualização Dia/Semana/Mês renderiza colunas corretas
- [QA] `hideSunday` oculta domingo nas visões semana/mês
- [QA] Bloqueio de horário fora do expediente (business_hours) exibe estado "indisponível"

## 2. Criação de agendamento (✅ unit + [QA])
- ✅ `calculateAppointmentTimesInTimeZone` respeita fuso e duração
- ✅ Conflito por profissional retorna "Profissional ocupado"
- ✅ Conflito por sala retorna "Sala ocupada"
- ✅ Ausência do profissional retorna "Profissional ausente"
- [QA] NewAppointmentDialog: validação de campos obrigatórios
- [QA] Searchable Select de cliente/serviço/profissional funcional
- [QA] Salvar agendamento dispara realtime e atualiza UI sem reload
- [QA] Conflito exibe mensagem inline e bloqueia submit

## 3. Edição/Reagendamento (✅ + [QA])
- ✅ Reagendar mantém histórico (`appointmentHistoryFormat`)
- [QA] Drag & drop entre horários atualiza start/end
- [QA] Editar pacote_appointment cria entrada `rescheduled` mas mantém visível na agenda

## 4. Cancelamento e exclusão (✅ + [QA])
- ✅ Status cancelado removido das contagens financeiras
- [QA] Recorrência: 3 modos (apenas este, este+futuros, todos)
- [QA] Exclusão cascata limpa `financial_entries` e `commission_entries`

## 5. Pacotes (✅ unit)
- ✅ `packageAvailability`: pacote vendido com 10 sessões permanece visível
- ✅ `packageSequence` mantém ordem após reagendamento
- ✅ `findNextAvailablePackageSlot` pula conflitos
- ✅ `isServiceCompatibleWithPackage` valida prof/sala
- [QA] Cancelar pacote calcula reembolso descontando custo de material por aplicação
- [QA] Sessões usadas decrementam saldo em tempo real

## 6. Ausências do profissional ([QA])
- [QA] Criar ausência bloqueia horários sobrepostos
- [QA] Validação impede agendar sobre ausência (toast de erro)
- [QA] Ausência recorrente propaga para múltiplos dias

## 7. Cores e identidade visual (✅ unit)
- ✅ `getProfessionalColor` aplica fallback agenda_color → color → default
- ✅ Estilos de card/botão/badge/avatar/slot consistentes
- [QA] Cor configurada aparece em: AppointmentCard, MobileAgendaList,
       CommissionsReport e relatório de atendimentos

## 8. Status (✅ unit)
- ✅ Todos os 6 status retornam config válido
- ✅ Fallback para "scheduled" em status nulo/desconhecido
- ✅ Estilos usam tokens HSL semânticos

## 9. Tempo real e sincronização ([QA])
- [QA] Insert/Update/Delete em `appointments` propaga para todos os clientes via Supabase Realtime
- [QA] Cache de React Query invalidado em <1s após mudança remota
- [QA] StaleTime 0 para créditos de pacote reflete imediatamente

## 10. Mobile / responsividade ([QA])
- [QA] <480px usa MobileAgendaList com densidade 10-12px
- [QA] Bottom sheets abrem para detalhes do agendamento
- [QA] Painéis de automação iniciam recolhidos

## 11. Auto-complete de atendimentos (✅ código)
- [QA] `useAutoCompleteAppointments` marca atendimentos vencidos como completed a cada 5 min
- [QA] Toast informa a quantidade processada

## 12. Posição/retomar listagem (✅ hook)
- [QA] Banner aparece ao voltar para Clientes/Produtos/Serviços
- [QA] Restaura página, busca e letra ativa
- [QA] Expira após 8h ou ao limpar sessão

## 13. Banco de dados / RLS (security--get_scan_results)
- [QA] Profissional só lê seus próprios agendamentos
- [QA] `audit_log` registra create/update/delete via trigger SECURITY DEFINER
- [QA] Inserts em `professionals` de outro tenant retornam 403/erro RLS

## Como executar
```bash
# Unit tests (vitest)
bunx vitest run

# E2E (após scaffold)
bunx playwright test
```
