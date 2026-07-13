import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Espelha a regra usada em PackageTemplateDetailDialog / NewPackageDialog /
// PackageDetailDialog para pacotes sequenciais: a duração total (soma das
// etapas) pode ultrapassar 8h, então o cap é 48000 min (100 etapas × 8h).
const sequentialDurationSchema = z.coerce
  .number()
  .min(5, 'Duração mínima de 5 minutos')
  .max(48000, 'Duração total muito longa');

describe('sequential package duration schema', () => {
  it('aceita soma > 8h (evita bloqueio "Máximo de 8 horas" ao salvar sequencial)', () => {
    // 4 etapas × 3h = 720 min. Antes falhava com max(480).
    expect(() => sequentialDurationSchema.parse(720)).not.toThrow();
    expect(() => sequentialDurationSchema.parse(1440)).not.toThrow();
  });

  it('mantém piso mínimo de 5 minutos', () => {
    expect(() => sequentialDurationSchema.parse(2)).toThrow();
  });

  it('rejeita valores absurdos (> 48000 min)', () => {
    expect(() => sequentialDurationSchema.parse(50000)).toThrow();
  });
});
