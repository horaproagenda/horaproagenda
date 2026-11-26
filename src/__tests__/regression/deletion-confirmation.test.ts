import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDeletion, getPendingDeletion, resolveDeletion, withDeletionConfirmation } from '@/lib/deletionConfirmation';

afterEach(() => resolveDeletion(false));
const product = { itemName: 'Café', removed: ['Cadastro', 'Compras', 'Ciclos de uso'] };

describe('autorização explícita antes de excluir', () => {
  it('não executa exclusão antes da confirmação e cancelar não apaga', async () => {
    const action = vi.fn();
    const result = withDeletionConfirmation(product, action);
    expect(action).not.toHaveBeenCalled();
    expect(getPendingDeletion()?.itemName).toBe('Café');
    expect(getPendingDeletion()?.removed).toEqual(['Cadastro', 'Compras', 'Ciclos de uso']);
    resolveDeletion(false);
    await result;
    expect(action).not.toHaveBeenCalled();
  });
  it('confirmação executa somente a operação escolhida uma vez', async () => {
    const action = vi.fn();
    const result = withDeletionConfirmation(product, action);
    resolveDeletion(true);
    resolveDeletion(true);
    await result;
    expect(action).toHaveBeenCalledTimes(1);
    expect(getPendingDeletion()).toBeNull();
  });
  it('duplo clique não troca o item nem autoriza outra exclusão', async () => {
    const first = confirmDeletion(product);
    expect(await confirmDeletion({ itemName: 'Luva', removed: ['Cadastro'] })).toBe(false);
    expect(getPendingDeletion()?.itemName).toBe('Café');
    resolveDeletion(true);
    expect(await first).toBe(true);
  });
  it('não aceita exclusão sem identificar o item ou sem informar o alcance', async () => {
    expect(await confirmDeletion({ itemName: ' ', removed: ['Cadastro'] })).toBe(false);
    expect(await confirmDeletion({ itemName: 'Café', removed: [] })).toBe(false);
    expect(getPendingDeletion()).toBeNull();
  });
});