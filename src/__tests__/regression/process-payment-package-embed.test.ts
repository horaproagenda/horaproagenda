import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/process-payment/index.ts', 'utf-8');

describe('process-payment: baixa de pacote', () => {
  it('não usa embed ambíguo entre package_appointments e appointments', () => {
    expect(source).not.toMatch(/appointment:appointments\(/);
    expect(source).not.toMatch(/select\('appointment:appointments[^!]/);
  });

  it('busca as sessões do pacote apenas por appointment_id', () => {
    expect(source).toContain("from('package_appointments')");
    expect(source).toContain("select('appointment_id')");
  });
});
