import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const load = async () => await import('../packageBatchScheduling');

const item = (overrides: Record<string, unknown> = {}) => ({
  packageAppointmentId: 'step-6',
  serviceId: 'svc-6',
  professionalId: 'prof-1',
  roomId: 'room-1',
  start: new Date('2026-10-01T13:00:00.000Z'),
  end: new Date('2026-10-01T14:00:00.000Z'),
  step: 6,
  ...overrides,
});

describe('agendamento de pacotes em transação única', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('grava todas as sessões numa só chamada, com o ID único da etapa', async () => {
    rpc.mockResolvedValue({ data: { created_count: 2, requested_count: 2, created: [], already_scheduled: [] }, error: null });
    const { schedulePackageSessionsBatch } = await load();

    await schedulePackageSessionsBatch({
      clientId: 'client-1',
      packageId: 'pkg-1',
      items: [item(), item({ packageAppointmentId: 'step-7', step: 7 })],
      batchKey: 'batch-1',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    const items = args.p_items as Array<Record<string, unknown>>;
    expect(fn).toBe('schedule_package_sessions_batch');
    expect(items).toHaveLength(2);
    expect(items[0].package_appointment_id).toBe('step-6');
    expect(items[1].package_appointment_id).toBe('step-7');
    expect(args.p_batch_key).toBe('batch-1');
  });

  it('propaga o motivo do banco sem inventar mensagem', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Aplicação 3 (Axila): a sala escolhida já está ocupada.' } });
    const { schedulePackageSessionsBatch } = await load();

    await expect(
      schedulePackageSessionsBatch({ clientId: 'c', packageId: 'p', items: [item()] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Aplicação 3') });
  });

  it('corrige automaticamente e só avisa o que sobrou', async () => {
    rpc
      .mockResolvedValueOnce({ data: { ok: false, checked: 1, issues: [{ step: '6', problem: 'Aplicação 6 ficou sem agendamento.' }] }, error: null })
      .mockResolvedValueOnce({ data: { cleared: 1, relinked: 1 }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, checked: 1, issues: [] }, error: null });

    const { verifyAndHealPackageSchedule } = await load();
    const remaining = await verifyAndHealPackageSchedule('pkg-1', [item()]);

    expect(remaining).toEqual([]);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'verify_package_schedule_batch',
      'autoheal_package_schedule',
      'verify_package_schedule_batch',
    ]);
  });

  it('a correção automática nunca interrompe o fluxo', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'falhou' } });
    const { autohealPackageSchedule } = await load();
    await expect(autohealPackageSchedule('pkg-1')).resolves.toMatchObject({ changed: false });
  });
});

describe('formulário de agendamento (anti-regressão)', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../components/appointments/NewAppointmentDialog.tsx'),
    'utf8',
  );

  it('usa a gravação única do pacote, não uma chamada por sessão', () => {
    expect(source).toContain('schedulePackageSessionsBatch');
    expect(source).toContain('verifyAndHealPackageSchedule');
    // O laço antigo criava as sessões uma a uma em segundo plano.
    expect(source).not.toContain('Agendando ${editablePreviewDates.length} sessões em segundo plano');
  });

  it('valida a série com a mesma verificação do banco', () => {
    expect(source).toContain('checkAvailabilitySlots');
  });
});
