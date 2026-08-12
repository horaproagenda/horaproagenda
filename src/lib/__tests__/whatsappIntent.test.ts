import { describe, expect, it } from 'vitest';
import {
  detectIntent,
  extractMessageText,
  extractSenderPhone,
  phonesMatch,
} from '../../../supabase/functions/_shared/whatsappIntent';

describe('detectIntent', () => {
  it('reconhece confirmações', () => {
    for (const t of ['1', 'sim', 'Confirmo', 'CONFIRMAR', 'ok', 'Vou sim', 'Beleza', '✅', '👍']) {
      expect(detectIntent(t)).toBe('confirm');
    }
  });

  it('reconhece cancelamentos', () => {
    for (const t of ['2', 'não', 'nao posso', 'Não vou poder ir', 'cancelar', 'desmarcar', 'remarcar', '❌']) {
      expect(detectIntent(t)).toBe('cancel');
    }
  });

  it('retorna null para respostas ambíguas', () => {
    expect(detectIntent('bom dia, quanto custa?')).toBeNull();
    expect(detectIntent('')).toBeNull();
  });
});

describe('phonesMatch', () => {
  it('tolera DDI e nono dígito', () => {
    expect(phonesMatch('5537999356025', '(37) 99935-6025')).toBe(true);
    expect(phonesMatch('37999356025', '5537999356025')).toBe(true);
  });
  it('não casa números diferentes', () => {
    expect(phonesMatch('5537999356025', '5537988887777')).toBe(false);
    expect(phonesMatch('', '5537999356025')).toBe(false);
  });
});

describe('extractSenderPhone', () => {
  it('ignora JID @lid e usa o alternativo', () => {
    const phone = extractSenderPhone({ key: { remoteJid: '123456789@lid', remoteJidAlt: '553799356025@s.whatsapp.net' } });
    expect(phone).toBe('553799356025');
  });
  it('ignora grupos', () => {
    expect(extractSenderPhone({ key: { remoteJid: '123-456@g.us' } })).toBeNull();
  });
});

describe('extractMessageText', () => {
  it('lê botões e listas', () => {
    expect(extractMessageText({ message: { buttonsResponseMessage: { selectedDisplayText: 'Confirmar' } } })).toBe('Confirmar');
    expect(extractMessageText({ message: { conversation: 'sim' } })).toBe('sim');
  });
});
