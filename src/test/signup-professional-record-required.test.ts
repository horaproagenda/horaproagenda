import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(`supabase/functions/${f}/index.ts`, "utf8");

describe("cadastro exige registro de profissional", () => {
  it("complete-signup não engole falha do profissional e desfaz a conta", () => {
    const s = read("complete-signup");
    expect(s).not.toMatch(/console\.warn\("complete-signup first professional insert failed/);
    expect(s).toMatch(/code: "professional_record_failed"/);
    expect(s).toMatch(/auth\.admin\.deleteUser\(userId\)/);
  });
  it("admin-create-account-user usa a coluna is_active", () => {
    const s = read("admin-create-account-user");
    expect(s).toMatch(/is_active: true/);
    expect(s).not.toMatch(/^\s*active: true,/m);
  });
  it("admin-create-professional desfaz o usuário se o profissional falhar", () => {
    const s = read("admin-create-professional");
    expect(s).toMatch(/professional_record_failed/);
    expect(s).toMatch(/deleteUser\(createdNowId\)/);
  });
});
