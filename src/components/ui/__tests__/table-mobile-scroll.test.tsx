import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = window.ResizeObserver;
const originalTableScrollWidth = Object.getOwnPropertyDescriptor(HTMLTableElement.prototype, 'scrollWidth');
const originalDivClientWidth = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'clientWidth');

function mockPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockOverflowingTable() {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;

  Object.defineProperty(HTMLTableElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 320,
  });
}

function renderWideTable() {
  render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>30/06/2026</TableCell>
          <TableCell>Movimentação consolidada</TableCell>
          <TableCell>R$ 150,00</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table mobile horizontal scroll', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.ResizeObserver = originalResizeObserver;
    if (originalTableScrollWidth) {
      Object.defineProperty(HTMLTableElement.prototype, 'scrollWidth', originalTableScrollWidth);
    } else {
      delete (HTMLTableElement.prototype as { scrollWidth?: number }).scrollWidth;
    }
    if (originalDivClientWidth) {
      Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', originalDivClientWidth);
    } else {
      delete (HTMLDivElement.prototype as { clientWidth?: number }).clientWidth;
    }
    vi.restoreAllMocks();
  });

  it('keeps the mirrored top scrollbar on desktop overflow', async () => {
    mockPointer(false);
    mockOverflowingTable();

    renderWideTable();

    await waitFor(() => {
      expect(screen.getByTestId('table-top-scroll')).toBeInTheDocument();
    });
  });

  it('uses native single-scroll behavior on coarse pointer devices', async () => {
    mockPointer(true);
    mockOverflowingTable();

    renderWideTable();

    await waitFor(() => {
      expect(screen.queryByTestId('table-top-scroll')).not.toBeInTheDocument();
    });
  });
});