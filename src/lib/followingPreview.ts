// Prévia pura das sessões seguintes ao reagendar "este e todos os seguintes":
// todas as sessões futuras se deslocam pelo mesmo intervalo do agendamento
// editado (mantendo os intervalos entre elas). Concluídas/canceladas ficam.
export interface PreviewItem { id: string; start_time: string; status?: string | null }
export interface PreviewRow { id: string; from: Date; to: Date; locked: boolean }

const LOCKED = ['completed', 'cancelled', 'missed'];

export function buildFollowingPreview(
  items: PreviewItem[],
  originalStart: string,
  newStart: Date,
  currentId: string,
): PreviewRow[] {
  const origin = new Date(originalStart).getTime();
  const delta = newStart.getTime() - origin;
  return items
    .filter((i) => i.id !== currentId && new Date(i.start_time).getTime() > origin)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((i) => {
      const from = new Date(i.start_time);
      const locked = LOCKED.includes(i.status || '');
      return { id: i.id, from, to: locked ? from : new Date(from.getTime() + delta), locked };
    });
}
