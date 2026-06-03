Deno.test("env check", () => {
  console.log("HAS SR:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  console.log("HAS URL:", !!Deno.env.get("SUPABASE_URL"));
  console.log("KEYS:", Object.keys(Deno.env.toObject()).filter(k => k.includes("SUPA")).join(","));
});
