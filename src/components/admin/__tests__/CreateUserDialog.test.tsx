import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  invoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  usage: { current: null as unknown },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, success: h.toastSuccess, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/useSeatUsage', () => ({
  useSeatUsage: () => h.usage.current,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'admin@test.com' }, hasRole: () => true }),
}));

vi.mock('@/hooks/useAccountSubscription', () => ({
  useAccountSubscription: () => ({ subscription: { seat_limit: 1, is_grandfathered: false } }),
}));

import { CreateUserDialog } from '../UsuariosContaSection';

const renderDialog = () =>
  render(
    <MemoryRouter>
      <CreateUserDialog open onOpenChange={() => {}} onCreated={() => {}} />
    </MemoryRouter>,
  );

describe('CreateUserDialog — upgrade CTA', () => {
  beforeEach(() => {
    h.navigate.mockClear();
    h.invoke.mockClear();
    h.toastError.mockClear();
    h.toastSuccess.mockClear();
  });

  // Diálogos usam portal: sem desmontar, o DOM acumula entre casos e as buscas
  // por texto passam a encontrar múltiplos elementos (teste instável).
  afterEach(() => {
    cleanup();
  });

  it('shows upgrade CTA and hides "Criar usuário" when no seats available', () => {
    h.usage.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderDialog();
    expect(screen.getAllByText(/não permite mais usuários/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /criar usuário/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /mudar de plano/i }).length).toBeGreaterThan(0);
  });

  it('navigates to /assinatura when clicking "Mudar de plano"', () => {
    h.usage.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderDialog();
    fireEvent.click(screen.getAllByRole('button', { name: /mudar de plano/i })[0]);
    expect(h.navigate).toHaveBeenCalledWith('/assinatura');
  });

  it('shows "Criar usuário" and no CTA when seats are available', () => {
    h.usage.current = { used: 1, seat_limit: 3, available: 2, is_grandfathered: false };
    renderDialog();
    expect(screen.queryByText(/não permite mais usuários/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar usuário/i })).toBeInTheDocument();
  });

  it('hides upgrade CTA for grandfathered accounts even at capacity', () => {
    h.usage.current = { used: 10, seat_limit: 1, available: 0, is_grandfathered: true };
    renderDialog();
    expect(screen.queryByText(/não permite mais usuários/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar usuário/i })).toBeInTheDocument();
  });
});
