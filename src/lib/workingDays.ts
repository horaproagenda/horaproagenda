/**
 * Regras de dias atendidos (domingo/sábado).
 *
 * Fonte da verdade: as configurações do estabelecimento (`work_sundays` /
 * `work_saturdays`). Quando o atendimento aos domingos está desligado, nenhum
 * agendamento — manual, automático, pacote, série ou reagendamento — pode cair
 * em um domingo. O banco também bloqueia (trigger `trg_block_non_working_days`),
 * este helper serve para avisar o usuário antes de tentar salvar.
 */

export interface WorkingDaysConfig {
  work_sundays?: boolean | null;
  work_saturdays?: boolean | null;
}

export function isSchedulableDay(date: Date, config?: WorkingDaysConfig | null): boolean {
  const dow = date.getDay();
  if (dow === 0) return !!config?.work_sundays;
  if (dow === 6) return config?.work_saturdays !== false;
  return true;
}

/** Mensagem clara em português quando o dia não é atendido; null quando é válido. */
export function nonWorkingDayMessage(date: Date, config?: WorkingDaysConfig | null): string | null {
  if (isSchedulableDay(date, config)) return null;
  const dow = date.getDay();
  const dia = dow === 0 ? 'domingos' : 'sábados';
  return `O estabelecimento não atende aos ${dia}. Escolha outra data para o agendamento.`;
}

/** Avança a data até o próximo dia atendido, preservando o horário. */
export function nextSchedulableDay(date: Date, config?: WorkingDaysConfig | null): Date {
  const candidate = new Date(date);
  for (let i = 0; i < 14; i += 1) {
    if (isSchedulableDay(candidate, config)) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}
