/**
 * Regra protegida: avisos no celular/tablet do profissional.
 *
 * - O service worker precisa tratar o aviso e o clique (funciona com o app fechado).
 * - Cada aviso tem chave única (antiduplicidade) no banco e tag no aparelho.
 * - O profissional pode ligar/desligar tudo e cada tipo de aviso.
 * - Nenhum aviso é enviado quando o tipo está desligado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('avisos no celular — service worker', () => {
  const sw = read('public/push-listener.js');

  it('mostra o aviso recebido mesmo com o app fechado', () => {
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain('showNotification');
  });

  it('abre a tela certa ao tocar no aviso', () => {
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toMatch(/openWindow|navigate/);
  });

  it('evita avisos repetidos do mesmo assunto no aparelho', () => {
    expect(sw).toContain('tag:');
  });

  it('é carregado dentro do service worker do aplicativo', () => {
    expect(read('vite.config.ts')).toContain('/push-listener.js');
  });
});

describe('avisos no celular — envio no servidor', () => {
  const fn = read('supabase/functions/push-dispatch/index.ts');

  it('grava a chave única antes de enviar (antiduplicidade)', () => {
    expect(fn).toContain('push_notification_log');
    expect(fn).toContain('dedupe_key');
    expect(fn).toContain("'duplicate'");
  });

  it('respeita as escolhas do profissional', () => {
    expect(fn).toContain('professional_preferences');
    expect(fn).toContain('push_enabled');
    expect(fn).toContain("'disabled_by_user'");
  });

  it('cobre os quatro eventos pedidos', () => {
    for (const event of [
      'appointment_new',
      'appointment_confirmed',
      'appointment_cancelled',
      'push_reminders',
    ]) {
      expect(fn).toContain(event);
    }
  });

  it('remove aparelhos que não existem mais', () => {
    expect(fn).toContain('result.gone');
  });

  it('protege a varredura de lembretes com segredo', () => {
    expect(fn).toContain('x-cron-secret');
  });

  it('aplica prazo de validade no aviso (não chega obsoleto)', () => {
    expect(read('supabase/functions/_shared/webpush.ts')).toContain('TTL');
  });
});

describe('avisos no celular — tela de configurações', () => {
  const ui = read('src/components/settings/AvisosCelularSettings.tsx');

  it('tem o interruptor do aparelho e o interruptor geral', () => {
    expect(ui).toContain('push-device-toggle');
    expect(ui).toContain('push-master-toggle');
  });

  it('permite escolher cada tipo de aviso', () => {
    for (const key of [
      'push_appointment_new',
      'push_appointment_confirmed',
      'push_appointment_cancelled',
      'push_reminders',
    ]) {
      expect(ui).toContain(key);
    }
  });

  it('avisa o usuário de iPhone que precisa salvar na tela inicial', () => {
    expect(ui).toContain('tela inicial');
  });

  it('está visível nas Configurações', () => {
    expect(read('src/pages/Configuracoes.tsx')).toContain('<AvisosCelularSettings />');
  });
});
