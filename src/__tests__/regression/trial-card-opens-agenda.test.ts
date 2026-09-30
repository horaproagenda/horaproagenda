import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync("src/components/admin/AssinaturaSection.tsx", "utf8");

describe("Cartão do teste grátis abre a agenda", () => {
  it("atualiza a assinatura na memória antes de navegar para /agenda", () => {
    const handler = src.slice(src.indexOf("const handleSubscribe"), src.indexOf("const handleUpdateCard"));
    const setIdx = handler.indexOf("qc.setQueryData(key");
    const navIdx = handler.indexOf('navigate("/agenda"');
    expect(setIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(setIdx);
    expect(handler).toMatch(/status: "trial"/);
  });
});
