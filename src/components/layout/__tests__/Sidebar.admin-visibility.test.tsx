import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppRole } from '@/types';

// --- Mocks ---
const useAuthMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/routePrefetch', () => ({
  prefetchRoute: vi.fn(),
  prefetchRoutes: vi.fn(),
}));

vi.mock('@/lib/superAdminAllowlist', () => ({
  isSuperAdminEmail: (email?: string | null) => email === 'owner@horapro.app',
}));

vi.mock('@/assets/horapro-icon.png', () => ({ default: 'icon.png' }));

import { Sidebar } from '@/components/layout/Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar
        onNewAppointment={() => {}}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    </MemoryRouter>,
  );
}

function authState(overrides: {
  roles?: AppRole[];
  loading?: boolean;
  email?: string | null;
}) {
  const roles = overrides.roles ?? [];
  return {
    user: overrides.email === null ? null : { id: 'u1', email: overrides.email ?? 'pro@horapro.app' },
    profile: { full_name: 'Test', email: overrides.email ?? 'pro@horapro.app' },
    roles,
    loading: overrides.loading ?? false,
    hasRole: (r: AppRole) => roles.includes(r),
    signOut: vi.fn(),
  };
}

describe('Sidebar admin visibility (integration)', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    sessionStorage.clear();
  });

  it('hides "Painel do Administrador" while auth is loading', () => {
    useAuthMock.mockReturnValue(authState({ loading: true, roles: ['admin'] }));
    renderSidebar();
    expect(screen.queryByText('Painel do Administrador')).not.toBeInTheDocument();
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('hides admin link for a plain professional', () => {
    useAuthMock.mockReturnValue(authState({ roles: ['professional'] as AppRole[] }));
    renderSidebar();
    expect(screen.queryByText('Painel do Administrador')).not.toBeInTheDocument();
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
    // Sanity: baseline items still render.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows admin link once the admin role is loaded', () => {
    useAuthMock.mockReturnValue(authState({ roles: ['admin'] as AppRole[] }));
    renderSidebar();
    expect(screen.getByText('Painel do Administrador')).toBeInTheDocument();
    // Super Admin still hidden — user isn't on the platform-owner allowlist.
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('shows Super Admin only for the platform-owner allowlist', () => {
    useAuthMock.mockReturnValue(
      authState({
        roles: ['admin', 'super_admin'] as AppRole[],
        email: 'owner@horapro.app',
      }),
    );
    renderSidebar();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Painel do Administrador')).toBeInTheDocument();
  });
});
