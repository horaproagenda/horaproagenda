import { useState, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ForcePasswordChangeGate } from "@/components/auth/ForcePasswordChangeGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCrossDeviceSync } from "@/hooks/useCrossDeviceSync";
import { useWheelScrollFix } from "@/hooks/useWheelScrollFix";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { useVersionWatcher } from "@/hooks/useVersionWatcher";
import { usePostUpdateDataHeal } from "@/hooks/usePostUpdateDataHeal";
import { useAutoHealing } from "@/hooks/useAutoHealing";
import { useAgendaIntegrityAutoCheck } from "@/hooks/useAgendaIntegrityAutoCheck";
import { useSaleFlowIntegrityAutoCheck } from "@/hooks/useSaleFlowIntegrityAutoCheck";
import { usePaymentIntegrityAutoCheck } from "@/hooks/usePaymentIntegrityAutoCheck";
import { useLayoutWatchdog } from "@/hooks/useLayoutWatchdog";

// Eager: rotas críticas no boot (login, dashboard, 404, landing pública)
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import { useAuth } from "@/contexts/AuthContext";

// Lazy: cada página vira um chunk independente.
// Reduz bundle inicial e acelera navegação subsequente.
import { lazyWithRetry } from "./lib/chunkErrorRecovery";
const Agenda = lazy(lazyWithRetry(() => import("./pages/Agenda")));
const Clientes = lazy(lazyWithRetry(() => import("./pages/Clientes")));
const ClienteDetalhes = lazy(lazyWithRetry(() => import("./pages/ClienteDetalhes")));
const ProfissionalDetalhes = lazy(lazyWithRetry(() => import("./pages/ProfissionalDetalhes")));
const Servicos = lazy(lazyWithRetry(() => import("./pages/Servicos")));
const Cadastros = lazy(lazyWithRetry(() => import("./pages/Cadastros")));
const Caixa = lazy(lazyWithRetry(() => import("./pages/Caixa")));
const Financeiro = lazy(lazyWithRetry(() => import("./pages/Financeiro")));
const Produtos = lazy(lazyWithRetry(() => import("./pages/Produtos")));
const Relatorios = lazy(lazyWithRetry(() => import("./pages/Relatorios")));
const Lembretes = lazy(lazyWithRetry(() => import("./pages/Lembretes")));
const Documentos = lazy(lazyWithRetry(() => import("./pages/Documentos")));
const Configuracoes = lazy(lazyWithRetry(() => import("./pages/Configuracoes")));
// Auditoria removido — informações agora no Painel Admin
const AdminPanel = lazy(lazyWithRetry(() => import("./pages/AdminPanel")));
const SuperAdmin = lazy(lazyWithRetry(() => import("./pages/SuperAdmin")));
const UsuariosConta = lazy(lazyWithRetry(() => import("./pages/UsuariosConta")));
const Ajuda = lazy(lazyWithRetry(() => import("./pages/Ajuda")));
const Suporte = lazy(lazyWithRetry(() => import("./pages/Suporte")));
const Assinatura = lazy(lazyWithRetry(() => import("./pages/Assinatura")));
const AssinaturaSucesso = lazy(lazyWithRetry(() => import("./pages/AssinaturaSucesso")));
const AssinaturaCancelado = lazy(lazyWithRetry(() => import("./pages/AssinaturaCancelado")));
const PreencherDocumento = lazy(lazyWithRetry(() => import("./pages/PreencherDocumento")));
const CadastroCliente = lazy(lazyWithRetry(() => import("./pages/CadastroCliente")));
const Unsubscribe = lazy(lazyWithRetry(() => import("./pages/Unsubscribe")));
const TermosDeServico = lazy(lazyWithRetry(() => import("./pages/TermosDeServico")));
const PoliticaDePrivacidade = lazy(lazyWithRetry(() => import("./pages/PoliticaDePrivacidade")));
const ContaInativa = lazy(lazyWithRetry(() => import("./pages/ContaInativa")));
const ConfirmarAgendamento = lazy(lazyWithRetry(() => import("./pages/ConfirmarAgendamento")));
const OAuthConsent = lazy(lazyWithRetry(() => import("./pages/OAuthConsent")));

// Fallback minimalista enquanto o chunk da rota carrega.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

// Configuração otimizada do QueryClient - criado uma única vez
const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime curto: garante que ao trocar de tela/aba/dispositivo
      // os dados sejam revalidados rapidamente. Aumentado para 60s para
      // reduzir refetch agressivo em navegações rápidas entre rotas.
      staleTime: 1000 * 60, // 60s
      gcTime: 1000 * 60 * 10, // 10 minutos - mantém cache p/ navegação rápida
      // placeholderData global: zero flicker entre navegações que reutilizam
      // o mesmo queryKey (listas, filtros, paginação).
      placeholderData: keepPreviousData,
      // Revalida ao focar a janela e ao voltar online -> sincroniza
      // automaticamente celular/tablet/desktop quando o usuário volta a usar.
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
      retry: 1,
    },
  },
});

// Componente wrapper para ativar realtime sync + sincronização entre dispositivos
function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  useCrossDeviceSync();
  usePostUpdateDataHeal();
  useAutoHealing();
  useAgendaIntegrityAutoCheck();
  useSaleFlowIntegrityAutoCheck();
  usePaymentIntegrityAutoCheck();
  return <>{children}</>;
}

/**
 * Rota raiz: landing pública para visitantes, dashboard para autenticados.
 * Mantém `/` indexável pelo Google enquanto preserva acesso direto ao app
 * para usuários logados.
 */
function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <RouteFallback />;
  }
  if (!user) return <Landing />;
  return <ProtectedRoute><Index /></ProtectedRoute>;
}

const App = () => {
  // Usar useState para garantir que o queryClient seja estável entre re-renders
  const [queryClient] = useState(createQueryClient);
  useWheelScrollFix();
  useAppUpdater();
  useVersionWatcher();
  useLayoutWatchdog();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSyncProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ForcePasswordChangeGate>
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                {/* Public routes */}
                <Route path="/preencher-documento" element={<PreencherDocumento />} />
                <Route path="/preencher-documento/:slug" element={<PreencherDocumento />} />
                <Route path="/cadastro-cliente/:token" element={<CadastroCliente />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="/c/:token" element={<ConfirmarAgendamento />} />
                <Route path="/termos-de-servico" element={<TermosDeServico />} />
                <Route path="/politica-de-privacidade" element={<PoliticaDePrivacidade />} />
                <Route path="/conta-inativa" element={<ContaInativa />} />
                <Route path="/" element={<HomeRoute />} />
                <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
                <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
                <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhes /></ProtectedRoute>} />
                <Route path="/servicos" element={<ProtectedRoute><Servicos /></ProtectedRoute>} />
                <Route path="/cadastros" element={<ProtectedRoute><Cadastros /></ProtectedRoute>} />
                <Route path="/profissional/:id" element={<ProtectedRoute><ProfissionalDetalhes /></ProtectedRoute>} />
                <Route path="/caixa" element={<ProtectedRoute><Caixa /></ProtectedRoute>} />
                <Route path="/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
                <Route path="/produtos" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
                <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
                <Route path="/lembretes" element={<ProtectedRoute><Lembretes /></ProtectedRoute>} />
                <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
                <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
                <Route path="/auditoria" element={<Navigate to="/admin" replace />} />
                <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
                <Route path="/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
                <Route path="/usuarios-conta" element={<ProtectedRoute><UsuariosConta /></ProtectedRoute>} />
                <Route path="/ajuda" element={<ProtectedRoute><Ajuda /></ProtectedRoute>} />
                <Route path="/suporte" element={<ProtectedRoute><Suporte /></ProtectedRoute>} />
                <Route path="/assinatura" element={<ProtectedRoute><Assinatura /></ProtectedRoute>} />
                <Route path="/assinatura/sucesso" element={<ProtectedRoute><AssinaturaSucesso /></ProtectedRoute>} />
                <Route path="/assinatura/cancelado" element={<ProtectedRoute><AssinaturaCancelado /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
            </ForcePasswordChangeGate>
          </TooltipProvider>
        </RealtimeSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
