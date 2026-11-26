import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p, "utf8");

describe("nitidez do topo no iPhone", () => {
  it("faixa do relógio não é translúcida", () => {
    const html = read("index.html");
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(html).not.toContain("black-translucent");
  });
  it("cabeçalhos fixos não usam desfoque", () => {
    for (const f of ["src/pages/Landing.tsx", "src/pages/Assinatura.tsx", "src/pages/AssinaturaStatus.tsx", "src/components/layout/Header.tsx"]) {
      const header = read(f).match(/<header[^>]*>/)?.[0] ?? "";
      expect(header).not.toMatch(/backdrop-blur/);
    }
  });
  it("existe faixa sólida na área segura do topo", () => {
    expect(read("src/index.css")).toMatch(/body::before[\s\S]*safe-area-inset-top/);
  });
});
