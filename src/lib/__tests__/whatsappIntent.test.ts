import { describe, expect, it } from 'vitest';
import {
  detectIntent,
  extractMessageText,
  extractSenderPhone,
  isEchoOfSystemMessage,
  phonesMatch,
} from '../../../supabase/functions/_shared/whatsappIntent';

describe('detectIntent', () => {
  it('reconhece confirmações', () => {
    for (const t of ['1', 'sim', 'Confirmo', 'CONFIRMAR', 'Vou sim', 'Estarei presente', '✅', '👍']) {
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

describe('cortesias não confirmam presença', () => {
  it.each(['Ok, obrigada', 'obrigado', 'beleza', 'blz', 'show', 'perfeito', 'ótimo', 'claro'])(
    '"%s" não é confirmação',
    (msg) => {
      expect(detectIntent(msg)).toBeNull();
    },
  );

  it('respostas objetivas continuam valendo', () => {
    expect(detectIntent('1')).toBe('confirm');
    expect(detectIntent('Confirmar')).toBe('confirm');
    expect(detectIntent('sim')).toBe('confirm');
    expect(detectIntent('2')).toBe('cancel');
    expect(detectIntent('não posso')).toBe('cancel');
  });
});

describe('isEchoOfSystemMessage', () => {
  it('detecta eco das mensagens automáticas', () => {
    expect(isEchoOfSystemMessage('Presença confirmada! ✅\n\nSeu horário: *14/08 às 08:00*.\nAté breve! ✨')).toBe(true);
    expect(isEchoOfSystemMessage('Não entendi sua resposta 🙂 Responda *1* para confirmar')).toBe(true);
  });
  it('não marca mensagens reais do cliente', () => {
    expect(isEchoOfSystemMessage('1')).toBe(false);
    expect(isEchoOfSystemMessage('Bom dia, posso remarcar?')).toBe(false);
  });
});

import { detectIntent as _di, isEchoOfSystemMessage as _echo } from '../../../supabase/functions/_shared/whatsappIntent';
import { describe as _d, it as _it, expect as _e } from 'vitest';
_d('falso cancelamento', () => {
  const lembrete = 'Olá Ana! Lembrete do seu agendamento amanhã às 09:00.\n\n✅ *CONFIRMAR presença:*\nhttps://x/c/abc?a=confirm\n\n❌ *CANCELAR agendamento:*\nhttps://x/c/abc?a=cancel';
  _it('eco/citação do lembrete não cancela', () => { _e(_di(lembrete)).toBeNull(); _e(_echo(lembrete)).toBe(true); });
  _it('texto com confirmar e cancelar é ambíguo', () => { _e(_di('quero confirmar, não cancelar')).not.toBe('cancel'); });
  _it('"confirmar" continua confirmando', () => { _e(_di('confirmar')).toBe('confirm'); _e(_di('está confirmado')).toBe('confirm'); });
  _it('"2" continua cancelando', () => { _e(_di('2')).toBe('cancel'); });
});
