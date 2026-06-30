// Paleta ampla de cores para diferenciar profissionais na agenda.
// Cada cor é única e pensada para ter bom contraste sobre fundos claros e escuros.
// Quando uma cor é escolhida por um profissional, ela fica indisponível para os demais.

export interface AgendaColor {
  value: string;
  label: string;
}

export const AGENDA_COLOR_PALETTE: AgendaColor[] = [
  // Azuis
  { value: '#1E3A8A', label: 'Azul Marinho' },
  { value: '#2563EB', label: 'Azul Royal' },
  { value: '#3B82F6', label: 'Azul' },
  { value: '#0EA5E9', label: 'Azul Céu' },
  { value: '#06B6D4', label: 'Ciano' },
  { value: '#0D9488', label: 'Turquesa' },

  // Verdes
  { value: '#047857', label: 'Verde Floresta' },
  { value: '#10B981', label: 'Verde' },
  { value: '#22C55E', label: 'Verde Limão' },
  { value: '#84CC16', label: 'Verde Oliva' },

  // Amarelos / Laranjas
  { value: '#EAB308', label: 'Amarelo' },
  { value: '#F59E0B', label: 'Âmbar' },
  { value: '#F97316', label: 'Laranja' },
  { value: '#EA580C', label: 'Laranja Queimado' },

  // Vermelhos / Rosas
  { value: '#DC2626', label: 'Vermelho' },
  { value: '#EF4444', label: 'Vermelho Coral' },
  { value: '#E11D48', label: 'Carmim' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#F472B6', label: 'Rosa Claro' },
  { value: '#DB2777', label: 'Magenta' },

  // Roxos / Violetas
  { value: '#7C3AED', label: 'Violeta' },
  { value: '#8B5CF6', label: 'Roxo' },
  { value: '#A855F7', label: 'Lilás' },
  { value: '#6366F1', label: 'Índigo' },
  { value: '#4F46E5', label: 'Anil' },

  // Neutros quentes / terrosos
  { value: '#92400E', label: 'Caramelo' },
  { value: '#A16207', label: 'Mostarda' },
  { value: '#78350F', label: 'Café' },
  { value: '#7C2D12', label: 'Terracota' },

  // Neutros frios
  { value: '#475569', label: 'Cinza Ardósia' },
  { value: '#334155', label: 'Chumbo' },
  { value: '#0F766E', label: 'Verde Petróleo' },
  { value: '#52525B', label: 'Grafite' },
];

export const DEFAULT_AGENDA_COLOR = AGENDA_COLOR_PALETTE[2].value; // Azul

/** Retorna a primeira cor da paleta não utilizada pelos profissionais informados. */
export function pickNextAvailableColor(
  takenColors: Array<string | null | undefined>,
  fallback: string = DEFAULT_AGENDA_COLOR,
): string {
  const taken = new Set(
    takenColors.filter(Boolean).map((c) => (c as string).toLowerCase()),
  );
  const free = AGENDA_COLOR_PALETTE.find((c) => !taken.has(c.value.toLowerCase()));
  return free?.value ?? fallback;
}

/** Verifica se a cor já está em uso por outro profissional. */
export function isColorTaken(
  color: string,
  takenColors: Array<string | null | undefined>,
): boolean {
  const c = (color || '').toLowerCase();
  return takenColors.some((t) => (t || '').toLowerCase() === c);
}

export function getAgendaColorLabel(value: string | null | undefined): string {
  if (!value) return '';
  return (
    AGENDA_COLOR_PALETTE.find((c) => c.value.toLowerCase() === value.toLowerCase())
      ?.label ?? value
  );
}
