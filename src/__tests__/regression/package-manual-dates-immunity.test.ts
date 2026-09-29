import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dialog = readFileSync(
  resolve(__dirname, '../../components/appointments/NewAppointmentDialog.tsx'),
  'utf8',
);

describe('Datas e horários manuais de pacotes/séries são definitivos', () => {
  it('mantém as etapas editadas à mão fora do recálculo automático', () => {
    expect(dialog).toContain('mergePreservingManualEdits');
    expect(dialog).toContain('manualPackageDateIndices');
    expect(dialog).toContain('manualServiceDateIndices');
    // O efeito de recálculo precisa mesclar, nunca substituir a lista inteira.
    expect(dialog).not.toMatch(
      /setEditablePreviewDates\(\(prev\) => \{\s*const prevSig[\s\S]{0,120}: calculatePreviewDates;/,
    );
  });

  it('marca como manual toda etapa alterada pelo profissional', () => {
    expect(dialog).toMatch(/updateEditableDate[\s\S]{0,400}setManualPackageDateIndices/);
    expect(dialog).toMatch(/updateEditableServiceDate[\s\S]{0,400}setManualServiceDateIndices/);
  });

  it('fixa dia e hora no fuso da clínica, não no fuso do aparelho', () => {
    expect(dialog).toContain('const withClinicTime');
    expect(dialog).toContain('const clinicDayAnchor');
    // Nenhuma montagem de data/hora das prévias via setHours local.
    expect(dialog).not.toContain('merged.setHours(');
    expect(dialog).not.toContain('next.setHours(previewDate.getHours()');
  });

  it('limpa as marcações manuais ao abrir ou limpar o formulário', () => {
    const occurrences = dialog.match(/setManualPackageDateIndices\(new Set\(\)\)/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
