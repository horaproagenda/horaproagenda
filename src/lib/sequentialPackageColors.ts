// Paleta fixa de cores para diferenciar visualmente cada serviço distinto
// dentro de um pacote sequencial. As cores são atribuídas na ordem em que
// os serviços aparecem para manter contraste alto entre etapas vizinhas.
const PALETTE = [
  { bg: 'bg-primary/10 dark:bg-primary/40', text: 'text-primary dark:text-primary/80', dot: 'bg-primary/80', border: 'border-primary/30 dark:border-primary/30' },
  { bg: 'bg-primary/10 dark:bg-primary/40', text: 'text-primary dark:text-primary/80', dot: 'bg-primary/80', border: 'border-primary/30 dark:border-primary/30' },
  { bg: 'bg-accent/10 dark:bg-accent/40', text: 'text-accent dark:text-accent/80', dot: 'bg-accent/80', border: 'border-accent/30 dark:border-accent/30' },
  { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-900 dark:text-amber-100', dot: 'bg-amber-500', border: 'border-amber-300 dark:border-amber-800' },
  { bg: 'bg-accent/10 dark:bg-accent/40', text: 'text-accent dark:text-accent/80', dot: 'bg-accent/80', border: 'border-accent/30 dark:border-accent/30' },
  { bg: 'bg-primary/10 dark:bg-primary/40', text: 'text-primary dark:text-primary/80', dot: 'bg-primary/80', border: 'border-primary/30 dark:border-primary/30' },
  { bg: 'bg-accent/10 dark:bg-accent/40', text: 'text-accent dark:text-accent/80', dot: 'bg-accent/80', border: 'border-accent/30 dark:border-accent/30' },
  { bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-900 dark:text-orange-100', dot: 'bg-orange-500', border: 'border-orange-300 dark:border-orange-800' },
  { bg: 'bg-accent/10 dark:bg-accent/40', text: 'text-accent dark:text-accent/80', dot: 'bg-accent/80', border: 'border-accent/30 dark:border-accent/30' },
  { bg: 'bg-primary/10 dark:bg-primary/40', text: 'text-primary dark:text-primary/80', dot: 'bg-primary/80', border: 'border-primary/30 dark:border-primary/30' },
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
