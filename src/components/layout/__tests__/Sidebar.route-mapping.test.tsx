import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppRole } from '@/types';

const useAuthMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const isMobileMock = vi.fn(() => true);
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobileMock(),
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

const EXPECTED_ROUTES = [
  '/dashboard', '/agenda', '/clientes', '/servicos', '/cadastros', '/caixa',
  '/financeiro', '/produtos', '/lembretes', '/documentos', '/relatorios',
  '/admin', '/configuracoes', '/ajuda', '/suporte',
];

function LocationSpy({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation();
  onChange(location.pathname);
  return null;
}

function renderSidebar(currentPath: string, capture: (p: string) => void, onClose = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <Sidebar
        onNewAppointment={() => {}}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        mobileOpen
        onMobileClose={onClose}
      />
      <Routes>
        <Route path="*" element={<LocationSpy onChange={capture} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fullAuth() {
  const roles: AppRole[] = ['admin', 'super_admin'];
  return {
    user: { id: 'u1', email: 'owner@horapro.app' },
    profile: { full_name: 'Owner', email: 'owner@horapro.app' },
    roles,
    loading: false,
    hasRole: (r: AppRole) => roles.includes(r),
    signOut: vi.fn(),
  };
}

describe('Sidebar route mapping (mobile)', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue(fullAuth());
    sessionStorage.clear();
    isMobileMock.mockReturnValue(true);
  });

  it('every menu item is declared as a <Route> in App.tsx', () => {
    const appTsx = readFileSync(path.resolve(__dirname, '../../../App.tsx'), 'utf-8');
    for (const href of EXPECTED_ROUTES) {
      expect(appTsx, `App.tsx must declare route ${href}`).toContain(`path="${href}"`);
    }
  });

  it.each(EXPECTED_ROUTES)('mobile tap navigates to %s', async (href) => {
    let currentPath = '/agenda';
    const capture = (p: string) => { currentPath = p; };
    const onClose = vi.fn();
    renderSidebar('/agenda', capture, onClose);

    const link = screen.getByTestId(`sidebar-link-${href}`);
    fireEvent.click(link);
    expect(currentPath).toBe(href);
    // handleNavClick schedules onMobileClose via setTimeout(0).
    await new Promise((r) => setTimeout(r, 0));
    expect(onClose).toHaveBeenCalled();
  });


  it('renders as aria-modal dialog when mobile drawer is open', () => {
    renderSidebar('/', vi.fn());
    const aside = document.querySelector('aside[role="dialog"]');
    expect(aside).not.toBeNull();
    expect(aside?.getAttribute('aria-modal')).toBe('true');
  });
});
