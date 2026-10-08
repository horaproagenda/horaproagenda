/** Ordena datas da mais cedo para a mais tarde, sem alterar nenhuma delas. */
export function sortDatesChronologically(dates: Date[]): Date[] {
  return [...dates].sort((a, b) => a.getTime() - b.getTime());
}
