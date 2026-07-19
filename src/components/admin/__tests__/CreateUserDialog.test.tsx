import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, warning: vi.fn(), info: vi.fn() },
}));

const usageRef: { current: unknown } = { current: null };
vi.mock('@/hooks/useSeatUsage', () => ({
  useSeatUsage: () => usageRef.current,
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
    navigateMock.mockClear();
    invokeMock.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it('shows upgrade CTA and hides "Criar usuário" when no seats available', () => {
    usageRef.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderDialog();
    expect(screen.getByText(/não permite mais usuários/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /criar usuário/i })).not.toBeInTheDocument();
    const ctas = screen.getAllByRole('button', { name: /mudar de plano/i });
    expect(ctas.length).toBeGreaterThan(0);
  });

  it('navigates to /assinatura when clicking "Mudar de plano"', () => {
    usageRef.current = { used: 1, seat_limit: 1, available: 0, is_grandfathered: false };
    renderDialog();
    fireEvent.click(screen.getAllByRole('button', { name: /mudar de plano/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith('/assinatura');
  });

  it('shows "Criar usuário" and no CTA when seats are available', () => {
    usageRef.current = { used: 1, seat_limit: 3, available: 2, is_grandfathered: false };
    renderDialog();
    expect(screen.queryByText(/não permite mais usuários/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar usuário/i })).toBeInTheDocument();
  });

  it('hides upgrade CTA for grandfathered accounts even at capacity', () => {
    usageRef.current = { used: 10, seat_limit: 1, available: 0, is_grandfathered: true };
    renderDialog();
    expect(screen.queryByText(/não permite mais usuários/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar usuário/i })).toBeInTheDocument();
  });
});
