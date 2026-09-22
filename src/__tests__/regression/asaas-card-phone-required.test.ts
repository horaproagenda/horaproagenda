import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dialog = readFileSync("src/components/billing/CreditCardDialog.tsx", "utf8");
const createFn = readFileSync("supabase/functions/asaas-create-subscription/index.ts", "utf8");
const updateFn = readFileSync("supabase/functions/asaas-update-card/index.ts", "utf8");
const errors = readFileSync("supabase/functions/_shared/asaasErrors.ts", "utf8");

describe("cadastro de cartão: telefone com DDD e erro claro", () => {
  it("o formulário exige telefone com DDD", () => {
    expect(dialog).toContain("Telefone do titular com DDD");
    expect(dialog).toContain("[10, 11].includes(digitsOnly(phone).length)");
    expect(dialog).not.toContain("Telefone do titular (opcional)");
  });

  it("a criação da assinatura envia phone e mobilePhone ao gateway", () => {
    expect(createFn).toContain("phone: effectivePhone");
    expect(createFn).toContain("mobilePhone: effectivePhone");
    expect(createFn).toContain("Informe o telefone do titular com DDD");
  });

  it("a troca de cartão exige e envia o telefone", () => {
    expect(updateFn).toContain("telefone do titular com DDD");
    expect(updateFn).toContain("mobilePhone: holderPhone");
  });

  it("o erro do gateway é repassado de forma legível", () => {
    expect(errors).toContain("friendlyAsaasError");
    expect(createFn).toContain("friendlyAsaasError(");
    expect(updateFn).toContain("friendlyAsaasError(");
    expect(createFn).not.toContain('msg.startsWith("Asaas")');
  });
});
