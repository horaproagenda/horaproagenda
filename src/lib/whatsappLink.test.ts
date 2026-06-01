import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizePhoneForWaMe,
  buildWaMeUrl,
  buildWebWhatsappUrl,
  openWhatsappWithMessage,
  renderTemplate,
  adjustHourToQuietWindow,
} from './whatsappLink';

describe('normalizePhoneForWaMe', () => {
  it('strips non-digits and adds Brazilian country code', () => {
    expect(normalizePhoneForWaMe('(11) 98765-4321')).toBe('5511987654321');
  });
  it('keeps existing 55 country code', () => {
    expect(normalizePhoneForWaMe('+55 11 98765-4321')).toBe('5511987654321');
  });
  it('strips leading zero', () => {
    expect(normalizePhoneForWaMe('011987654321')).toBe('5511987654321');
  });
  it('returns empty string for empty input', () => {
    expect(normalizePhoneForWaMe('')).toBe('');
  });
});

describe('buildWaMeUrl', () => {
  it('builds a wa.me link with phone and encoded message', () => {
    const url = buildWaMeUrl('11987654321', 'Olá, tudo bem?');
    expect(url).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    expect(url).toContain(encodeURIComponent('Olá, tudo bem?'));
  });
  it('builds wa.me without phone when missing', () => {
    expect(buildWaMeUrl('', 'oi')).toBe('https://wa.me/?text=oi');
  });
});

describe('buildWebWhatsappUrl', () => {
  it('builds a web.whatsapp.com/send link with phone and encoded message', () => {
    const url = buildWebWhatsappUrl('11987654321', 'Olá, tudo bem?');
    expect(url).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?phone=5511987654321&text=/);
    expect(url).toContain(encodeURIComponent('Olá, tudo bem?'));
  });
});

describe('openWhatsappWithMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('tries wa.me first and then moves the same popup to web.whatsapp.com/send', () => {
    vi.useFakeTimers();
    const navigations: string[] = [];
    const popup = {
      closed: false,
      location: { replace: vi.fn((url: string) => navigations.push(url)), href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const result = openWhatsappWithMessage('11987654321', 'oi', { fallbackDelayMs: 10 });

    expect(result.ok).toBe(true);
    expect(result.route).toBe('wa.me');
    expect(navigations[0]).toBe('https://wa.me/5511987654321?text=oi');

    vi.advanceTimersByTime(10);

    expect(navigations[1]).toBe('https://web.whatsapp.com/send?phone=5511987654321&text=oi');
    expect(sessionStorage.getItem('agendalume:last-whatsapp-route')).toContain('web.whatsapp.com/send');
  });

  it('opens web.whatsapp.com/send directly when wa.me popup is blocked', () => {
    vi.spyOn(window, 'open')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({} as Window);

    const result = openWhatsappWithMessage('11987654321', 'oi');

    expect(result.ok).toBe(true);
    expect(result.route).toBe('web.whatsapp.com/send');
    expect(window.open).toHaveBeenLastCalledWith(
      'https://web.whatsapp.com/send?phone=5511987654321&text=oi',
      '_blank',
      'noopener,noreferrer',
    );
  });
});

describe('renderTemplate', () => {
  it('replaces {{primeiro_nome}} with only the first word of the client name', () => {
    const out = renderTemplate('Olá {{primeiro_nome}}!', { clientName: 'Maria Aparecida Silva' });
    expect(out).toBe('Olá Maria!');
  });
  it('supports {{data_extenso}} with Portuguese date formatting', () => {
    const out = renderTemplate('Seu horário é em {{data_extenso}}.', {
      appointmentDate: '2026-06-01',
    });
    // Should contain weekday + month name in Portuguese
    expect(out.toLowerCase()).toContain('junho');
    expect(out).toContain('2026');
    expect(out).toContain('1');
  });
  it('renders short {{data}} as dd/MM/yyyy without timezone drift', () => {
    const out = renderTemplate('{{data}}', { appointmentDate: '2026-06-01' });
    expect(out).toBe('01/06/2026');
  });
  it('renders {{horario}} verbatim', () => {
    const out = renderTemplate('às {{horario}}', { appointmentTime: '14:30' });
    expect(out).toBe('às 14:30');
  });
  it('leaves unknown variables untouched', () => {
    expect(renderTemplate('Hi {{xpto}}', {})).toBe('Hi {{xpto}}');
  });
  it('supports both {{var}} and {var} syntaxes', () => {
    const out = renderTemplate('{cliente} - {{servico}}', {
      clientName: 'Ana',
      serviceName: 'Limpeza',
    });
    expect(out).toBe('Ana - Limpeza');
  });
});

describe('adjustHourToQuietWindow', () => {
  it('clamps 21h to 20h when window is 8–20', () => {
    expect(adjustHourToQuietWindow(21, 8, 20)).toBe(19);
  });
  it('pushes 6h up to 8h when window starts at 8', () => {
    expect(adjustHourToQuietWindow(6, 8, 20)).toBe(8);
  });
  it('keeps a valid hour inside the window unchanged', () => {
    expect(adjustHourToQuietWindow(14, 8, 20)).toBe(14);
  });
  it('returns the hour unchanged when window is missing', () => {
    expect(adjustHourToQuietWindow(21, null, null)).toBe(21);
  });
  it('returns the hour unchanged when window is invalid (start >= end)', () => {
    expect(adjustHourToQuietWindow(10, 20, 8)).toBe(10);
  });
  it('boundary: end=24 allows 23h', () => {
    expect(adjustHourToQuietWindow(23, 0, 24)).toBe(23);
  });
});
