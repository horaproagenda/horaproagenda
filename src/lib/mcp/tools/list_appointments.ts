import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");

export default defineTool({
  name: "list_appointments",
  title: "Listar agendamentos",
  description:
    "Lista agendamentos da conta do usuário autenticado num intervalo de datas (YYYY-MM-DD). Se não informar datas, retorna os do dia atual. Respeita o isolamento por tenant.",
  inputSchema: {
    from: DateSchema.optional().describe("Data inicial (YYYY-MM-DD). Padrão: hoje."),
    to: DateSchema.optional().describe("Data final (YYYY-MM-DD). Padrão: hoje."),
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de resultados (padrão 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const today = new Date().toISOString().slice(0, 10);
    const start = from ?? today;
    const end = to ?? start;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, start_time, end_time, status, notes, client_id, professional_id, service_id",
      )
      .gte("appointment_date", start)
      .lte("appointment_date", end)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(limit ?? 100);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { appointments: data ?? [], range: { from: start, to: end } },
    };
  },
});
