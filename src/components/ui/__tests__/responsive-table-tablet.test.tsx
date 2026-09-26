import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveTable } from '@/components/ui/responsive-table';

function setWidth(width: number) {
  (window as unknown as { innerWidth: number }).innerWidth = width;
}

beforeAll(() => {
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
  }
});

const rows = [{ id: '1', name: 'Maria' }];
const columns = [
  { key: 'name', header: 'Nome', cell: (r: typeof rows[number]) => r.name },
];

describe('ResponsiveTable em tablets', () => {
  it('mostra cartões em largura de tablet (900px)', () => {
    setWidth(900);
    const { container } = render(
      <ResponsiveTable data={rows} columns={columns} getRowKey={(r) => r.id} />,
    );
    expect(container.querySelector('[data-responsive-cards]')).not.toBeNull();
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('Maria')).toBeTruthy();
  });

  it('mostra tabela em desktop (1280px)', () => {
    setWidth(1280);
    const { container } = render(
      <ResponsiveTable data={rows} columns={columns} getRowKey={(r) => r.id} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('[data-responsive-cards]')).toBeNull();
  });
});
