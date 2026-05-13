import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, Mail, ArrowLeft, CheckCircle2, Crown, Check, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isValidCPF, formatCPF } from '@/lib/cpfValidator';
import { Checkbox } from '@/components/ui/checkbox';
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

type AuthStep = 'email' | 'code' | 'phone' | 'phoneCode' | 'plan' | 'password';
type AuthView = 'login' | 'signup' | 'forgot-password' | 'reset-code';

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // View state
  const [authView, setAuthView] = useState<AuthView>('login');

  // Auth flow state
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [existingUserAlert, setExistingUserAlert] = useState<string | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupCpf, setSignupCpf] = useState('');
  const [signupCompany, setSignupCompany] = useState('');
  const [signupCnpj, setSignupCnpj] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [normalizedPhoneE164, setNormalizedPhoneE164] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');

  // Plans
  const plans = [
    {
      id: 'essencial',
      name: 'Essencial',
      price: 97,
      description: '1 profissional',
      features: ['Agenda ilimitada', 'Gestão de clientes', 'Relatórios básicos']
    },
    {
      id: 'profissional',
      name: 'Profissional',
      price: 147,
      description: 'Até 3 profissionais',
      features: ['Tudo do Essencial', 'Lembretes WhatsApp', 'Comissões automáticas'],
      popular: true
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 197,
      description: 'Até 5 profissionais',
      features: ['Tudo do Profissional', 'Multi-unidades', 'Suporte prioritário']
    }
  ];

  useEffect(() => {
    if (user) {
      navigate('/agenda', { replace: true });
    }
  }, [user, navigate]);

  const handleSendVerificationCode = async () => {
    if (!signupName.trim()) {
      toast({ title: 'Erro', description: 'Digite seu nome', variant: 'destructive' });
      return;
    }
    if (!signupEmail) {
      toast({ title: 'Erro', description: 'Digite seu email', variant: 'destructive' });
      return;
    }
    if (!isValidCPF(signupCpf)) {
      toast({ title: 'CPF inválido', description: 'Verifique o CPF digitado.', variant: 'destructive' });
      return;
    }
    const phoneDigits = signupPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      toast({ title: 'Celular inválido', description: 'Use DDD + número.', variant: 'destructive' });
      return;
    }
    if (!acceptTerms) {
      toast({ title: 'Aceite necessário', description: 'Você precisa concordar com os Termos de Serviço e a Política de Privacidade para continuar.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setExistingUserAlert(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: signupEmail, type: 'signup' }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAuthStep('code');
      toast({ 
        title: 'Código enviado!', 
        description: 'Verifique seu email para o código de verificação.' 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar código';
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      toast({ title: 'Erro', description: 'Digite o código de 6 dígitos', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-code', {
        body: { email: signupEmail, code: verificationCode }
      });

      if (error) throw error;
      
      if (!data?.valid) {
        toast({ title: 'Erro', description: data?.error || 'Código inválido', variant: 'destructive' });
        setLoading(false);
        return;
      }

      setCodeVerified(true);
      // Send phone code automatically
      const { data: smsData, error: smsErr } = await supabase.functions.invoke('send-phone-verification', {
        body: { phone: signupPhone },
      });
      if (smsErr || smsData?.error) {
        toast({ title: 'Erro ao enviar SMS', description: smsData?.error || 'Tente novamente', variant: 'destructive' });
        setLoading(false);
        return;
      }
      setNormalizedPhoneE164(smsData?.phone || '');
      setAuthStep('phoneCode');
      toast({ title: 'Email verificado!', description: 'Enviamos um SMS com o código para seu celular.' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao verificar código';
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: signupEmail, type: 'signup' }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setVerificationCode('');
      toast({ 
        title: 'Código reenviado!', 
        description: 'Verifique seu email.' 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao reenviar código';
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setResendingEmail(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (phoneCode.length !== 6) {
      toast({ title: 'Erro', description: 'Digite o código de 6 dígitos', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone-code', {
        body: { phone: signupPhone, code: phoneCode },
      });
      if (error) throw error;
      if (!data?.valid) {
        toast({ title: 'Erro', description: data?.error || 'Código inválido', variant: 'destructive' });
        return;
      }
      setPhoneVerified(true);
      setNormalizedPhoneE164(data?.phone || normalizedPhoneE164);
      setAuthStep('plan');
      toast({ title: 'Celular verificado!', description: 'Agora escolha seu plano.' });
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro ao verificar código';
      toast({ title: 'Erro', description: m, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendPhoneCode = async () => {
    setResendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-phone-verification', {
        body: { phone: signupPhone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPhoneCode('');
      toast({ title: 'SMS reenviado!', description: 'Verifique seu celular.' });
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro ao reenviar';
      toast({ title: 'Erro', description: m, variant: 'destructive' });
    } finally {
      setResendingEmail(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    // Client-side cooldown (defesa adicional — Supabase Auth já aplica rate limit por IP no servidor)
    const key = `login_attempts_${loginEmail.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    const state = raw ? JSON.parse(raw) as { count: number; lockedUntil: number } : { count: 0, lockedUntil: 0 };
    const now = Date.now();
    if (state.lockedUntil && now < state.lockedUntil) {
      const secs = Math.ceil((state.lockedUntil - now) / 1000);
      toast({
        title: 'Muitas tentativas',
        description: `Aguarde ${secs}s antes de tentar novamente.`,
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      const next = state.count + 1;
      // Cooldown progressivo: 3→15s, 5→60s, 7→300s, 10→900s
      let lock = 0;
      if (next >= 10) lock = 15 * 60 * 1000;
      else if (next >= 7) lock = 5 * 60 * 1000;
      else if (next >= 5) lock = 60 * 1000;
      else if (next >= 3) lock = 15 * 1000;
      const lockedUntil = lock ? now + lock : 0;
      localStorage.setItem(key, JSON.stringify({ count: next, lockedUntil }));

      const baseMsg = error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message;
      const lockMsg = lock ? ` Bloqueado por ${Math.ceil(lock / 1000)}s após ${next} tentativas.` : '';
      toast({
        title: 'Erro ao entrar',
        description: baseMsg + lockMsg,
        variant: 'destructive'
      });
    } else {
      localStorage.removeItem(key);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!codeVerified) {
      toast({ title: 'Erro', description: 'Primeiro verifique seu email', variant: 'destructive' });
      return;
    }
    if (!phoneVerified) {
      toast({ title: 'Erro', description: 'Primeiro verifique seu celular por SMS', variant: 'destructive' });
      return;
    }
    if (!isValidCPF(signupCpf)) {
      toast({ title: 'CPF inválido', variant: 'destructive' });
      return;
    }

    if (!signupPassword) {
      toast({ title: 'Erro', description: 'Digite uma senha', variant: 'destructive' });
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }

    if (signupPassword.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const { error } = await signUp(signupEmail, signupPassword, signupName, {
      phone: normalizedPhoneE164 || signupPhone,
      cpf: signupCpf,
      companyName: signupCompany,
      cnpj: signupCnpj,
      selectedPlan,
    });
    setLoading(false);

    if (error) {
      toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Bem-vindo(a)!', 
        description: 'Abrindo sua agenda agora.' 
      });
      navigate('/agenda', { replace: true });
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast({ title: 'Erro', description: 'Digite seu email', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Send verification code for password reset
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: forgotEmail, type: 'login' }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAuthView('reset-code');
      toast({ 
        title: 'Código enviado!', 
        description: 'Verifique seu email para o código de recuperação.' 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar código';
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
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
      // Verify code
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-code', {
        body: { email: forgotEmail, code: resetCode }
      });

      if (verifyError) throw verifyError;
      if (!verifyData?.valid) {
        toast({ title: 'Erro', description: verifyData?.error || 'Código inválido', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Update password using Supabase Admin API through edge function
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { email: forgotEmail, newPassword }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ 
        title: 'Senha alterada!', 
        description: 'Sua senha foi atualizada com sucesso. Faça login.' 
      });
      
      setAuthView('login');
      setLoginEmail(forgotEmail);
      setForgotEmail('');
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao alterar senha';
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetSignupFlow = () => {
    setAuthStep('email');
    setVerificationCode('');
    setCodeVerified(false);
    setPhoneCode('');
    setPhoneVerified(false);
    setNormalizedPhoneE164('');
    setSelectedPlan('');
    setExistingUserAlert(null);
  };

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    setAuthStep('password');
    toast({ 
      title: 'Plano selecionado!', 
      description: 'Agora crie sua senha para finalizar o cadastro.' 
    });
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Forgot Password View
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
              <Input
                id="forgot-email"
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleForgotPassword}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Enviar código de recuperação
            </Button>
            <button 
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
              onClick={() => setAuthView('login')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset Password Code View
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
            <CardDescription>
              Digite o código enviado para <span className="font-medium">{forgotEmail}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP 
                maxLength={6} 
                value={resetCode} 
                onChange={setResetCode}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirmar nova senha</Label>
              <Input
                id="confirm-new-password"
                type="password"
                placeholder="••••••••"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>

            <Button 
              className="w-full" 
              onClick={handleResetPassword}
              disabled={loading || resetCode.length !== 6}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Alterar senha
            </Button>

            <button 
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
              onClick={() => {
                setAuthView('forgot-password');
                setResetCode('');
                setNewPassword('');
                setConfirmNewPassword('');
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center gradient-hero p-4">
      <AuthSeo />
      <Card className={`w-full shadow-lg animate-scale-in ${authStep === 'plan' ? 'max-w-lg' : 'max-w-md'}`}>
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
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Entrar
                </Button>
                <button 
                  type="button"
                  className="w-full text-sm text-primary hover:underline"
                  onClick={() => setAuthView('forgot-password')}
                >
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {/* Alert for existing users */}
              {existingUserAlert && (
                <Alert className="mb-4 border-amber-500 bg-amber-50">
                  <AlertDescription className="text-amber-800">
                    {existingUserAlert}
                    <button 
                      type="button"
                      className="block mt-2 text-primary font-medium hover:underline"
                      onClick={() => setAuthView('forgot-password')}
                    >
                      Esqueci minha senha
                    </button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Step 1: Email and Name */}
              {authStep === 'email' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome completo *</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Seu nome"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email *</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-cpf">CPF *</Label>
                    <Input
                      id="signup-cpf"
                      type="text"
                      placeholder="000.000.000-00"
                      value={signupCpf}
                      onChange={(e) => setSignupCpf(e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (isValidCPF(v)) setSignupCpf(formatCPF(v));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Celular * (com DDD)</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Enviaremos um código por SMS para confirmar.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-company">Nome da empresa</Label>
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Nome da sua empresa (opcional)"
                      value={signupCompany}
                      onChange={(e) => setSignupCompany(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-cnpj">CNPJ</Label>
                    <Input
                      id="signup-cnpj"
                      type="text"
                      placeholder="00.000.000/0000-00 (opcional)"
                      value={signupCnpj}
                      onChange={(e) => setSignupCnpj(e.target.value)}
                    />
                  </div>
                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="accept-terms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="accept-terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                      Concordo com os{" "}
                      <Link to="/termos-de-servico" target="_blank" className="text-primary hover:underline">
                        Termos de Serviço
                      </Link>{" "}
                      e a{" "}
                      <Link to="/politica-de-privacidade" target="_blank" className="text-primary hover:underline">
                        Política de Privacidade
                      </Link>
                    </Label>
                  </div>
                  <Button 
                    type="button" 
                    className="w-full" 
                    onClick={handleSendVerificationCode}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                    Enviar código de verificação
                  </Button>
                </div>
              )}

              {/* Step 2: Verification Code */}
              {authStep === 'code' && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Verifique seu email</h3>
                    <p className="text-sm text-muted-foreground">
                      Enviamos um código de 6 dígitos para <span className="font-medium">{signupEmail}</span>
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <InputOTP 
                      maxLength={6} 
                      value={verificationCode} 
                      onChange={setVerificationCode}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button 
                    type="button" 
                    className="w-full" 
                    onClick={handleVerifyCode}
                    disabled={loading || verificationCode.length !== 6}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Verificar código
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button 
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={resetSignupFlow}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </button>
                    <button 
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      onClick={handleResendCode}
                      disabled={resendingEmail}
                    >
                      {resendingEmail ? 'Reenviando...' : 'Reenviar código'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2.5: Phone SMS Code */}
              {authStep === 'phoneCode' && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Verifique seu celular</h3>
                    <p className="text-sm text-muted-foreground">
                      Enviamos um SMS com 6 dígitos para <span className="font-medium">{normalizedPhoneE164 || signupPhone}</span>
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={phoneCode} onChange={setPhoneCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button type="button" className="w-full" onClick={handleVerifyPhoneCode} disabled={loading || phoneCode.length !== 6}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Verificar código SMS
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" className="text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => setAuthStep('code')}>
                      <ArrowLeft className="h-4 w-4" />Voltar
                    </button>
                    <button type="button" className="text-primary hover:underline disabled:opacity-50" onClick={handleResendPhoneCode} disabled={resendingEmail}>
                      {resendingEmail ? 'Reenviando...' : 'Reenviar SMS'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Select Plan */}
              {authStep === 'plan' && (
                <div className="space-y-4">
                  <div className="text-center space-y-2 mb-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold">Email verificado!</h3>
                    <p className="text-sm text-muted-foreground">
                      Escolha seu plano e comece com <span className="font-semibold text-primary">7 dias grátis</span>
                    </p>
                  </div>

                  <div className="space-y-3">
                    {plans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handleSelectPlan(plan.id)}
                        className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-primary ${
                          selectedPlan === plan.id ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{plan.name}</span>
                              {plan.popular && (
                                <Badge variant="secondary" className="text-xs">
                                  <Crown className="h-3 w-3 mr-1" />
                                  Popular
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{plan.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-bold">R$ {plan.price}</span>
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {plan.features.slice(0, 2).map((feature, idx) => (
                            <span key={idx} className="text-xs text-muted-foreground flex items-center gap-1">
                              <Check className="h-3 w-3 text-green-500" />
                              {feature}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    Você não será cobrado durante o período de teste
                  </p>

                  <button 
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
                    onClick={() => setAuthStep('code')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                </div>
              )}

              {/* Step 4: Create Password */}
              {authStep === 'password' && (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="text-center space-y-2 mb-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Último passo!</h3>
                    <p className="text-sm text-muted-foreground">
                      Crie uma senha para acessar sua conta
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirmar senha</Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar conta e começar teste grátis
                  </Button>

                  <button 
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
                    onClick={() => setAuthStep('plan')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                </form>
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
