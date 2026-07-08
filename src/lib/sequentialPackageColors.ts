// Paleta fixa de cores para diferenciar visualmente cada serviço distinto
// dentro de um pacote sequencial. As cores são atribuídas na ordem em que
// os serviços aparecem para manter contraste alto entre etapas vizinhas.
const PALETTE = [
  { bg: 'bg-pink-100 dark:bg-pink-950/40', text: 'text-pink-900 dark:text-pink-100', dot: 'bg-pink-500', border: 'border-pink-300 dark:border-pink-800' },
  { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-900 dark:text-emerald-100', dot: 'bg-emerald-500', border: 'border-emerald-300 dark:border-emerald-800' },
  { bg: 'bg-sky-100 dark:bg-sky-950/40', text: 'text-sky-900 dark:text-sky-100', dot: 'bg-sky-500', border: 'border-sky-300 dark:border-sky-800' },
  { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-900 dark:text-amber-100', dot: 'bg-amber-500', border: 'border-amber-300 dark:border-amber-800' },
  { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-900 dark:text-violet-100', dot: 'bg-violet-500', border: 'border-violet-300 dark:border-violet-800' },
  { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-900 dark:text-rose-100', dot: 'bg-rose-500', border: 'border-rose-300 dark:border-rose-800' },
  { bg: 'bg-teal-100 dark:bg-teal-950/40', text: 'text-teal-900 dark:text-teal-100', dot: 'bg-teal-500', border: 'border-teal-300 dark:border-teal-800' },
  { bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-900 dark:text-orange-100', dot: 'bg-orange-500', border: 'border-orange-300 dark:border-orange-800' },
  { bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-900 dark:text-indigo-100', dot: 'bg-indigo-500', border: 'border-indigo-300 dark:border-indigo-800' },
  { bg: 'bg-lime-100 dark:bg-lime-950/40', text: 'text-lime-900 dark:text-lime-100', dot: 'bg-lime-500', border: 'border-lime-300 dark:border-lime-800' },
];

export type SequentialServiceColor = typeof PALETTE[number];

export function buildSequentialServiceColorMap(serviceIds: Array<string | null | undefined>): Map<string, SequentialServiceColor> {
  const map = new Map<string, SequentialServiceColor>();
  serviceIds.forEach(id => {
    if (!id) return;
    if (map.has(id)) return;
    map.set(id, PALETTE[map.size % PALETTE.length]);
  });
  return map;
}

export function getSequentialServiceColor(serviceId: string | null | undefined, map: Map<string, SequentialServiceColor>): SequentialServiceColor {
  if (!serviceId) return PALETTE[0];
  return map.get(serviceId) || PALETTE[0];
}
