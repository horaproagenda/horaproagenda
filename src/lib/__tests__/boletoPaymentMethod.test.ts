import { describe, it, expect } from 'vitest';
import { resolveBoletoPaymentMethod } from '../boletoPaymentMethod';
const boleto = { id: 'b', name: 'Boleto Bancário' };
const pix = { id: 'p', name: 'Pix' };
describe('boleto parcelado', () => {
  it('parcela de boleto sem forma recebe Boleto', () => { expect(resolveBoletoPaymentMethod(true, null, boleto)).toEqual(boleto); });
  it('parcela de boleto não aceita Pix', () => { expect(resolveBoletoPaymentMethod(true, pix, boleto)).toEqual(boleto); });
  it('venda comum mantém a forma escolhida', () => { expect(resolveBoletoPaymentMethod(false, pix, boleto)).toEqual(pix); });
});
