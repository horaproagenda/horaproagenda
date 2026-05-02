/**
 * Helper centralizado para aplicar a cor configurada do profissional (agenda_color)
 * em todos os componentes visuais da agenda: cards, badges, botões, bordas e gradientes.
 *
 * Garante consistência visual entre Agenda, Relatórios, Comissões, Detalhes e Mobile.
 */

const DEFAULT_COLOR = '#3B82F6';

export interface ProfessionalLike {
  agenda_color?: string | null;
  color?: string | null;
}

/** Obtém a cor base do profissional (com fallback). */
export function getProfessionalColor(prof?: ProfessionalLike | null): string {
  return prof?.agenda_color || prof?.color || DEFAULT_COLOR;
}

/** Estilo para cards principais — borda esquerda colorida + leve gradiente. */
export function getProfessionalCardStyle(color: string): React.CSSProperties {
  return {
    borderLeftColor: color,
    background: `linear-gradient(to right, ${color}10, transparent 28%)`,
  };
}

/** Estilo para cards compactos (sem gradiente). */
export function getProfessionalAccentStyle(color: string): React.CSSProperties {
  return { borderLeftColor: color };
}

/** Estilo para botões primários do profissional. */
export function getProfessionalButtonStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    color: '#fff',
    borderColor: color,
  };
}

/** Estilo para botão outline com cor do profissional. */
export function getProfessionalOutlineButtonStyle(color: string): React.CSSProperties {
  return {
    borderColor: color,
    color,
    backgroundColor: `${color}10`,
  };
}

/** Estilo para badges (texto + borda + fundo translúcido). */
export function getProfessionalBadgeStyle(color: string): React.CSSProperties {
  return {
    color,
    borderColor: `${color}80`,
    backgroundColor: `${color}15`,
  };
}

/** Estilo para avatar com ring e fundo na cor do profissional. */
export function getProfessionalAvatarStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: `${color}20`,
    color,
    // Ring via box-shadow para evitar dependência de variável Tailwind dinâmica
    boxShadow: `0 0 0 2px ${color}40, 0 0 0 3px hsl(var(--background))`,
  };
}

/** Estilo para texto/nome do profissional. */
export function getProfessionalTextStyle(color: string): React.CSSProperties {
  return { color };
}

/** Estilo para "dot" indicador (bolinha). */
export function getProfessionalDotStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    boxShadow: `0 0 0 2px ${color}40`,
  };
}

/** Borda inferior em headers de tabela referente ao profissional. */
export function getProfessionalTableHeaderBorder(color: string): React.CSSProperties {
  return { borderBottomColor: `${color}40` };
}

/** Estilo de fundo para slot de agendamento na cor do profissional. */
export function getProfessionalSlotStyle(color: string, opacity = 0.18): React.CSSProperties {
  return {
    backgroundColor: `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
    borderLeftColor: color,
  };
}

export const PROFESSIONAL_COLOR_DEFAULT = DEFAULT_COLOR;
