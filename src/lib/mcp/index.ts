import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listClients from "./tools/list_clients";
import listAppointments from "./tools/list_appointments";

// O OAuth issuer DEVE ser o host direto do Supabase (não o proxy .lovable.cloud).
// Lemos o project ref do env inlined pelo Vite no build (import-safe).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hora-pro-mcp",
  title: "Hora Pro",
  version: "0.1.0",
  instructions:
    "Ferramentas do Hora Pro (agenda para clínicas de estética). Use `whoami` para checar autenticação, `list_clients` para listar/buscar clientes e `list_appointments` para consultar agendamentos por data. Todas as ferramentas respeitam o isolamento por tenant (multi-clínica) do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listClients, listAppointments],
});
