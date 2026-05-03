import { describe, it, expect } from 'vitest';
import {
  getProfessionalColor,
  getProfessionalCardStyle,
  getProfessionalButtonStyle,
  getProfessionalBadgeStyle,
  getProfessionalAvatarStyle,
  getProfessionalSlotStyle,
  PROFESSIONAL_COLOR_DEFAULT,
} from './professionalColors';

describe('professionalColors', () => {
  it('retorna agenda_color quando definido', () => {
    expect(getProfessionalColor({ agenda_color: '#FF0000' })).toBe('#FF0000');
  });

  it('faz fallback para color e depois default', () => {
    expect(getProfessionalColor({ color: '#00FF00' })).toBe('#00FF00');
    expect(getProfessionalColor(null)).toBe(PROFESSIONAL_COLOR_DEFAULT);
    expect(getProfessionalColor({})).toBe(PROFESSIONAL_COLOR_DEFAULT);
  });

  it('gera estilos consistentes com a cor base', () => {
    const c = '#123456';
    expect(getProfessionalCardStyle(c).borderLeftColor).toBe(c);
    expect(getProfessionalButtonStyle(c).backgroundColor).toBe(c);
    expect(getProfessionalBadgeStyle(c).color).toBe(c);
    expect(getProfessionalAvatarStyle(c).color).toBe(c);
  });

  it('aplica opacidade no slot style usando hex de 8 chars', () => {
    const style = getProfessionalSlotStyle('#123456', 0.5) as { backgroundColor: string };
    expect(style.backgroundColor.startsWith('#123456')).toBe(true);
    expect(style.backgroundColor.length).toBe(9);
  });
});
