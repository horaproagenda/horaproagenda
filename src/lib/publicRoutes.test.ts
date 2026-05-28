import { describe, it, expect } from 'vitest';
import appSource from '../App.tsx?raw';
import {
  PUBLIC_ROUTES,
  buildClientRegistrationUrl,
  CLIENT_REGISTRATION_ROUTE,
} from './publicRoutes';

/**
 * Garante que toda rota pública declarada em `publicRoutes.ts` está realmente
 * registrada em `src/App.tsx`. Isso impede regressões como o 404 do
 * `/cadastro-cliente/:token` quando o link é gerado mas a rota não existe.
 */
describe('public routes wiring', () => {
  for (const route of PUBLIC_ROUTES) {
    it(`registers ${route} in App.tsx`, () => {
      expect(appSource).toContain(`path="${route}"`);
    });
  }

  it('builds client registration URL using the canonical route prefix', () => {
    const url = buildClientRegistrationUrl('abc123');
    expect(url).toMatch(/\/cadastro-cliente\/abc123$/);
    expect(CLIENT_REGISTRATION_ROUTE.startsWith('/cadastro-cliente/')).toBe(true);
  });
});
