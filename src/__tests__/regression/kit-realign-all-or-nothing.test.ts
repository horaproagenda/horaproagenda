import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const hook = readFileSync('src/hooks/useKitAppointments.ts', 'utf8');
describe('kit: alterar os seguintes é tudo ou nada', () => {
  it('desfaz etapas já movidas quando uma falha', () => {
    expect(hook).toMatch(/done\.reverse\(\)/);
    expect(hook).toMatch(/done\.push\(\{ id: r\.id, start: r\.start_time, end: r\.end_time \}\)/);
  });
  it('criação do kit continua numa única chamada ao banco', () => {
    expect(hook).toMatch(/rpc\('create_composite_kit_appointments'/);
  });
});
