import { describe, it, expect } from 'vitest';
import { getSchedulingDurationMinutes } from '@/lib/duration';

describe('kit: duração da etapa, não a soma do kit', () => {
  const services = [
    { id: 'a', duration: 60 },
    { id: 'b', duration: 90 },
  ];
  const kit = { id: 'kit', duration: 180, service_components: [{ service_id: 'a' }, { service_id: 'b' }] };

  it('usa a duração da etapa mesmo quando a soma é menor que 8h', () => {
    expect(getSchedulingDurationMinutes(kit, services, 60, 0)).toBe(60);
    expect(getSchedulingDurationMinutes(kit, services, 60, 1)).toBe(90);
  });

  it('serviço comum mantém a própria duração', () => {
    expect(getSchedulingDurationMinutes({ id: 'x', duration: 45 }, services)).toBe(45);
  });
});
