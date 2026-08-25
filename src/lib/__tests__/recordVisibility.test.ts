import { describe, it, expect } from 'vitest';
import { DATA_VISIBILITIES, DEFAULT_RECORD_VISIBILITY } from '../permissions';

// Anti-regressão — bug "Privacidade Trancada": registros criados por
// profissionais/recepção ficavam invisíveis para o restante da equipe porque
// o seletor de visibilidade não existia nos formulários e tudo caía em
// 'private'. O padrão ao compartilhar deve ser 'clinic' (comportamento
// histórico do sistema) e as três visibilidades precisam existir.
describe('visibilidade padrão de novos registros', () => {
  it('padrão de compartilhamento é clinic (equipe inteira enxerga)', () => {
    expect(DEFAULT_RECORD_VISIBILITY).toBe('clinic');
  });

  it('visibilidades disponíveis seguem private/shared/clinic', () => {
    expect(DATA_VISIBILITIES.map(v => v.key)).toEqual(['private', 'shared', 'clinic']);
  });
});
