import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ForcePasswordChangeGate } from "@/components/auth/ForcePasswordChangeGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCrossDeviceSync } from "@/hooks/useCrossDeviceSync";
import { useWheelScrollFix } from "@/hooks/useWheelScrollFix";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import Index from "./pages/Index";
import Agenda from "./pages/Agenda";
import Clientes from "./pages/Clientes";
import ClienteDetalhes from "./pages/ClienteDetalhes";
import ProfissionalDetalhes from "./pages/ProfissionalDetalhes";
import Servicos from "./pages/Servicos";
import Cadastros from "./pages/Cadastros";
import Caixa from "./pages/Caixa";
import Financeiro from "./pages/Financeiro";
import Produtos from "./pages/Produtos";
import Relatorios from "./pages/Relatorios";
import Lembretes from "./pages/Lembretes";
import Documentos from "./pages/Documentos";
import Configuracoes from "./pages/Configuracoes";
import Auditoria from "./pages/Auditoria";
import Ajuda from "./pages/Ajuda";
import Suporte from "./pages/Suporte";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Assinatura from "./pages/Assinatura";
import AssinaturaSucesso from "./pages/AssinaturaSucesso";
import AssinaturaCancelado from "./pages/AssinaturaCancelado";
import PreencherDocumento from "./pages/PreencherDocumento";

// Configuração otimizada do QueryClient - criado uma única vez
const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime curto: garante que ao trocar de tela/aba/dispositivo
      // os dados sejam revalidados rapidamente.
      staleTime: 1000 * 30, // 30s
      gcTime: 1000 * 60 * 10, // 10 minutos - mantém cache p/ navegação rápida
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
  return <>{children}</>;
}

const App = () => {
  // Usar useState para garantir que o queryClient seja estável entre re-renders
  const [queryClient] = useState(createQueryClient);
  useWheelScrollFix();
  useAppUpdater();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSyncProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ForcePasswordChangeGate>
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                {/* Public route for client document filling */}
                <Route path="/preencher-documento" element={<PreencherDocumento />} />
                <Route path="/preencher-documento/:slug" element={<PreencherDocumento />} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
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
                <Route path="/auditoria" element={<ProtectedRoute><Auditoria /></ProtectedRoute>} />
                <Route path="/ajuda" element={<ProtectedRoute><Ajuda /></ProtectedRoute>} />
                <Route path="/suporte" element={<ProtectedRoute><Suporte /></ProtectedRoute>} />
                <Route path="/assinatura" element={<ProtectedRoute><Assinatura /></ProtectedRoute>} />
                <Route path="/assinatura/sucesso" element={<ProtectedRoute><AssinaturaSucesso /></ProtectedRoute>} />
                <Route path="/assinatura/cancelado" element={<ProtectedRoute><AssinaturaCancelado /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </ForcePasswordChangeGate>
          </TooltipProvider>
        </RealtimeSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;