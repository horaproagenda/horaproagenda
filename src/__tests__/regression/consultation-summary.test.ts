import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readSummaryStream } from '@/hooks/useConsultationNotes';

const stream = (parts: string[]) => new ReadableStream<Uint8Array>({
  start(c) { const e = new TextEncoder(); parts.forEach((p) => c.enqueue(e.encode(p))); c.close(); },
});

describe('resumo de consulta com IA', () => {
  it('junta o texto recebido aos poucos', async () => {
    const seen: string[] = [];
    const out = await readSummaryStream(stream(['Queixa / motivo', ' do atendimento:\n- dor']), (t) => seen.push(t));
    expect(out).toBe('Queixa / motivo do atendimento:\n- dor');
    expect(seen.length).toBe(2);
  });
  it('resposta vazia vira erro claro, nunca um resumo em branco', async () => {
    await expect(readSummaryStream(stream(['[[VAZIO]]']), () => {})).rejects.toThrow(/não devolveu/);
  });
  it('só chama a IA ao tocar em "Gerar resumo"', () => {
    const src = readFileSync('src/components/client-profile/ConsultationSummarySheet.tsx', 'utf8');
    const calls = src.match(/streamConsultationSummary\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(src).toMatch(/const generate = async[\s\S]*streamConsultationSummary\(/);
  });
});
