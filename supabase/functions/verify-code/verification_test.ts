import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  newOpaqueToken,
  normalizeVerificationCode,
  normalizeVerificationEmail,
  sha256,
} from "../_shared/verification.ts";

Deno.test("normaliza código colado sem alterar os seis dígitos", () => {
  assertEquals(normalizeVerificationCode("\u200b 123-456 "), "123456");
});

Deno.test("normaliza o e-mail da mesma forma em todas as etapas", () => {
  assertEquals(normalizeVerificationEmail(" Pessoa@Example.COM "), "pessoa@example.com");
});

Deno.test("autorização temporária é opaca e armazenada somente como hash", async () => {
  const first = newOpaqueToken();
  const second = newOpaqueToken();
  assertEquals(first.length, 64);
  assertNotEquals(first, second);
  assertNotEquals(await sha256(first), first);
  assertNotEquals(await sha256(first), await sha256(second));
});