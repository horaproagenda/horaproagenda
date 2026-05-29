import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, Mail, ArrowLeft, KeyRound, MessageCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Helmet } from 'react-helmet-async';

const AuthSeo = () => (
  <Helmet>
    <title>Entrar — Lume Agenda</title>
    <meta name="description" content="Acesse sua conta Lume Agenda ou cadastre-se para gerenciar agendamentos, clientes e financeiro da sua clínica de estética." />
    <link rel="canonical" href="https://agendalume.app/auth" />
    <meta property="og:title" content="Entrar — Lume Agenda" />
    <meta property="og:description" content="Acesse a Lume Agenda e gerencie sua clínica de estética em um só lugar." />
    <meta property="og:url" content="https://agendalume.app/auth" />
  </Helmet>
);

type AuthView = 'login' | 'signup' | 'forgot-password' | 'reset-code';
type SignupStep = 'identify' | 'code';

/** Aplica máscara brasileira (XX) XXXXX-XXXX enquanto o usuário digita. */
function maskBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function generate6DigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // View state
  const [authView, setAuthView] = useState<AuthView>('login');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form — fluxo WhatsApp (Nome + Telefone → Código)
  const [signupStep, setSignupStep] = useState<SignupStep>('identify');
  const [signupName, setSignupName] = useState('');
  const [signupPhoneMasked, setSignupPhoneMasked] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [whatsappCode, setWhatsappCode] = useState('');
  const [resending, setResending] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/agenda', { replace: true });
    }
  }, [user, navigate]);

  const resetSignupFlow = () => {
    setSignupStep('identify');
    setVerificationId(null);
    setWhatsappCode('');
  };

  /**
   * Etapa 1 → gera código de 6 dígitos e grava em `verificacoes_whatsapp`.
   * O envio real do código pelo WhatsApp será feito por uma API externa,
   * que lê esta tabela. Aqui apenas preparamos o registro.
   */
  const handleSendWhatsappCode = async () => {
    if (!signupName.trim()) {
      toast({ title: 'Informe seu nome', variant: 'destructive' });
      return;
    }
    const digits = signupPhoneMasked.replace(/\D/g, '');
    if (digits.length !== 11) {
      toast({
        title: 'Telefone inválido',
        description: 'Use DDD + 9 dígitos. Ex.: (11) 91234-5678',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const code = generate6DigitCode();
      const telefone = `+55${digits}`;

      const { data, error } = await supabase
        .from('verificacoes_whatsapp')
        .insert({ telefone, codigo_verificacao: code, verificado: false })
        .select('id')
        .single();

      if (error) throw error;

      setVerificationId(data.id);
      setSignupStep('code');
      toast({
        title: 'Código gerado!',
        description: 'Em instantes você receberá o código no WhatsApp.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar código';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Etapa 2 → valida o código informado contra a tabela e marca como verificado.
   */
  const handleConfirmCode = async () => {
    if (whatsappCode.length !== 6) {
      toast({ title: 'Digite o código de 6 dígitos', variant: 'destructive' });
      return;
    }
    if (!verificationId) {
      toast({ title: 'Sessão expirada', description: 'Solicite um novo código.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data: row, error: fetchErr } = await supabase
        .from('verificacoes_whatsapp')
        .select('id, codigo_verificacao, verificado, criado_em')
        .eq('id', verificationId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!row) {
        toast({ title: 'Código expirado', description: 'Solicite um novo código.', variant: 'destructive' });
        setSignupStep('identify');
        return;
      }

      const idadeMin = (Date.now() - new Date(row.criado_em).getTime()) / 60_000;
      if (idadeMin > 15) {
        toast({ title: 'Código expirado', description: 'Solicite um novo código.', variant: 'destructive' });
        setSignupStep('identify');
        return;
      }

      if (row.codigo_verificacao !== whatsappCode) {
        toast({ title: 'Código incorreto', description: 'Confira os 6 dígitos enviados.', variant: 'destructive' });
        return;
      }

      const { error: updateErr } = await supabase
        .from('verificacoes_whatsapp')
        .update({ verificado: true })
        .eq('id', verificationId);

      if (updateErr) throw updateErr;

      toast({
        title: 'WhatsApp confirmado!',
        description: 'Telefone validado com sucesso. Em breve você poderá agendar.',
      });
      // Próximo passo (criação de conta / agendamento) será conectado à API externa.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao confirmar código';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setWhatsappCode('');
    try {
      const digits = signupPhoneMasked.replace(/\D/g, '');
      const code = generate6DigitCode();
      const telefone = `+55${digits}`;
      const { data, error } = await supabase
        .from('verificacoes_whatsapp')
        .insert({ telefone, codigo_verificacao: code, verificado: false })
        .select('id')
        .single();
      if (error) throw error;
      setVerificationId(data.id);
      toast({ title: 'Novo código gerado', description: 'Verifique seu WhatsApp.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reenviar';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    const key = `login_attempts_${loginEmail.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    const state = raw ? JSON.parse(raw) as { count: number; lockedUntil: number } : { count: 0, lockedUntil: 0 };
    const now = Date.now();
    if (state.lockedUntil && now < state.lockedUntil) {
      const secs = Math.ceil((state.lockedUntil - now) / 1000);
      toast({ title: 'Muitas tentativas', description: `Aguarde ${secs}s antes de tentar novamente.`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      const next = state.count + 1;
      let lock = 0;
      if (next >= 10) lock = 15 * 60 * 1000;
      else if (next >= 7) lock = 5 * 60 * 1000;
      else if (next >= 5) lock = 60 * 1000;
      else if (next >= 3) lock = 15 * 1000;
      const lockedUntil = lock ? now + lock : 0;
      localStorage.setItem(key, JSON.stringify({ count: next, lockedUntil }));
      const baseMsg = error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message;
      const lockMsg = lock ? ` Bloqueado por ${Math.ceil(lock / 1000)}s após ${next} tentativas.` : '';
      toast({ title: 'Erro ao entrar', description: baseMsg + lockMsg, variant: 'destructive' });
    } else {
      localStorage.removeItem(key);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast({ title: 'Erro', description: 'Digite seu email', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: forgotEmail, type: 'login' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAuthView('reset-code');
      toast({ title: 'Código enviado!', description: 'Verifique seu email.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar código';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetCode.length !== 6) {
      toast({ title: 'Erro', description: 'Digite o código de 6 dígitos', variant: 'destructive' });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-code', {
        body: { email: forgotEmail, code: resetCode },
      });
      if (verifyError) throw verifyError;
      if (!verifyData?.valid) {
        toast({ title: 'Erro', description: verifyData?.error || 'Código inválido', variant: 'destructive' });
        return;
      }
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { email: forgotEmail, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Senha alterada!', description: 'Faça login com a nova senha.' });
      setAuthView('login');
      setLoginEmail(forgotEmail);
      setForgotEmail('');
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar senha';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authView === 'forgot-password') {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero p-4">
        <Card className="w-full max-w-md shadow-lg animate-scale-in">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
            <CardDescription>Digite seu email para recuperar sua senha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" type="email" placeholder="seu@email.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleForgotPassword} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Enviar código de recuperação
            </Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1" onClick={() => setAuthView('login')}>
              <ArrowLeft className="h-4 w-4" /> Voltar para o login
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authView === 'reset-code') {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero p-4">
        <Card className="w-full max-w-md shadow-lg animate-scale-in">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Redefinir senha</CardTitle>
            <CardDescription>Digite o código enviado para <span className="font-medium">{forgotEmail}</span></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={resetCode} onChange={setResetCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                  <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirmar nova senha</Label>
              <Input id="confirm-new-password" type="password" placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleResetPassword} disabled={loading || resetCode.length !== 6}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Alterar senha
            </Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1" onClick={() => { setAuthView('forgot-password'); setResetCode(''); setNewPassword(''); setConfirmNewPassword(''); }}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center gradient-hero p-4">
      <AuthSeo />
      <Card className="w-full max-w-md shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Lume Agenda</CardTitle>
          <CardDescription>Sistema de agendamento para clínica de estética</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full" onValueChange={() => resetSignupFlow()}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="seu@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input id="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Entrar
                </Button>
                <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setAuthView('forgot-password')}>
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {/* Etapa 1: Nome + Telefone */}
              {signupStep === 'identify' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Telefone (WhatsApp)</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="(11) 91234-5678"
                      value={signupPhoneMasked}
                      onChange={(e) => setSignupPhoneMasked(maskBrazilianPhone(e.target.value))}
                      autoComplete="tel-national"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use DDD + 9 dígitos. Enviaremos o código pelo WhatsApp.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={handleSendWhatsappCode}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                    Receber Código por WhatsApp
                  </Button>
                </div>
              )}

              {/* Etapa 2: Código de 6 dígitos */}
              {signupStep === 'code' && (
                <div className="space-y-6">
                  <Alert className="border-primary/30 bg-primary/5">
                    <AlertDescription className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>
                        Código enviado para o WhatsApp <span className="font-medium">{signupPhoneMasked}</span>.
                        Pode levar alguns segundos para chegar.
                      </span>
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2 text-center">
                    <Label className="block">Digite o código de 6 dígitos</Label>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={whatsappCode} onChange={setWhatsappCode}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                          <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={handleConfirmCode}
                    disabled={loading || whatsappCode.length !== 6}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar e Agendar
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={resetSignupFlow}
                    >
                      <ArrowLeft className="h-4 w-4" /> Voltar
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      onClick={handleResendCode}
                      disabled={resending}
                    >
                      {resending ? 'Reenviando...' : 'Reenviar código'}
                    </button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Ao utilizar o Lume Agenda, você concorda com nossos{" "}
              <Link to="/termos-de-servico" target="_blank" className="text-primary hover:underline">
                Termos de Serviço
              </Link>{" "}
              e{" "}
              <Link to="/politica-de-privacidade" target="_blank" className="text-primary hover:underline">
                Política de Privacidade
              </Link>.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
