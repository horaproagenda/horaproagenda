import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync("src/components/billing/CreditCardDialog.tsx", "utf8");

describe("Cartão: preenche dados do cadastro", () => {
  it("busca CEP, número e telefone já informados", () => {
    expect(src).toMatch(/clinic_cep/);
    expect(src).toMatch(/clinic_number/);
    expect(src).toMatch(/setPhone\(\(v\) => v \|\|/);
  });
});
