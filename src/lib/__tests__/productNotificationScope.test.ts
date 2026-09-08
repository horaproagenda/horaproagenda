import { describe, expect, it } from 'vitest';
import { filterProductsForNotifications } from '../productNotificationScope';

const clinicProduct = { created_by: 'admin-1', visibility: 'clinic' };
const adminPrivate = { created_by: 'admin-1', visibility: 'private' };
const ownProduct = { created_by: 'prof-1', visibility: 'private' };
const otherProfProduct = { created_by: 'prof-2', visibility: 'private' };

describe('avisos de produtos por escopo', () => {
  it('profissional com estoque próprio só é avisado dos produtos que cadastrou', () => {
    const result = filterProductsForNotifications(
      [clinicProduct, ownProduct, otherProfProduct],
      { userId: 'prof-1', onlyOwnProducts: true },
    );
    expect(result).toEqual([ownProduct]);
  });

  it('profissional com acesso aos produtos da clínica é avisado da clínica, não do estoque de outro', () => {
    const result = filterProductsForNotifications(
      [clinicProduct, otherProfProduct, ownProduct],
      { userId: 'prof-1', onlyOwnProducts: false },
    );
    expect(result).toEqual([clinicProduct, ownProduct]);
  });

  it('administração não recebe avisos do estoque particular de um profissional', () => {
    const result = filterProductsForNotifications(
      [clinicProduct, adminPrivate, otherProfProduct],
      { userId: 'admin-1', onlyOwnProducts: false },
    );
    expect(result).toEqual([clinicProduct, adminPrivate]);
  });
});
