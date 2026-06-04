import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, Mail, ArrowLeft, KeyRound, CheckCircle2, AlertTriangle, Ban, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Helmet } from 'react-helmet-async';
import { isValidCPF } from '@/lib/cpfValidator';
import { AuthErrorBoundary } from '@/components/auth/AuthErrorBoundary';

const TERMS_ACCEPT_KEY = 'lume_terms_accepted_v1';
const TERMS_VERSION = 'v1';
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 60_000;
const OTP_EXPIRY_SECONDS = 600; // 10 minutos

type OtpStatus =
  | { kind: 'idle' }
  | { kind: 'sent'; at: number }
  | { kind: 'expired' }
  | { kind: 'blocked'; until: number };

function OtpStatusAlert({ status, email, now }: { status: OtpStatus; email: string; now: number }) {
  // Assertivo para erros (expirado/bloqueado), educado para "enviado"
  const isError = status.kind === 'blocked' || status.kind === 'expired';
  const liveProps = {
    role: isError ? 'alert' : 'status',
    'aria-live': (isError ? 'assertive' : 'polite') as 'assertive' | 'polite',
    'aria-atomic': true as const,
  };

  if (status.kind === 'idle') {
    // Mantém um nó vivo para que mudanças subsequentes sejam anunciadas
    return <div {...liveProps} className="sr-only" />;
  }
  if (status.kind === 'blocked') {
    const secs = Math.max(0, Math.ceil((status.until - now) / 1000));
    return (
      <Alert variant="destructive" {...liveProps}>
        <Ban className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Acesso bloqueado por tentativas</AlertTitle>
        <AlertDescription>
          Muitos códigos incorretos foram digitados. Aguarde{' '}
          <span className="font-medium tabular-nums">
            <span aria-hidden="true">{secs}s</span>
            <span className="sr-only">{secs} segundos</span>
          </span>{' '}
          e solicite um novo código por segurança.
        </AlertDescription>
      </Alert>
    );
  }
  if (status.kind === 'expired') {
    return (
      <Alert variant="destructive" {...liveProps}>
        <Clock className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Código expirado</AlertTitle>
        <AlertDescription>
          O código enviado para <span className="font-medium">{email}</span> expirou. Clique em{' '}
          <span className="font-medium">Reenviar código</span> para receber um novo.
        </AlertDescription>
      </Alert>
    );
  }
  // sent
  const remaining = Math.max(0, Math.ceil((status.at + OTP_EXPIRY_SECONDS * 1000 - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <Alert className="border-primary/30 bg-primary/5" {...liveProps}>
      <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
      <AlertTitle>Código enviado</AlertTitle>
      <AlertDescription>
        Enviado para <span className="font-medium">{email}</span>. Válido por{' '}
        <span className="font-medium tabular-nums">
          <span aria-hidden="true">{mm}:{ss}</span>
          <span className="sr-only">
            {Math.floor(remaining / 60)} minutos e {remaining % 60} segundos
          </span>
        </span>
        . Confira também o spam.
      </AlertDescription>
    </Alert>
  );
}

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
type SignupStep = 'form' | 'terms' | 'code';

function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function AuthInner() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // View state
  const [authView, setAuthView] = useState<AuthView>('login');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form (email-only flow)
  const [signupStep, setSignupStep] = useState<SignupStep>('form');
  const [signupName, setSignupName] = useState('');
  const [signupCpf, setSignupCpf] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupCnpj, setSignupCnpj] = useState('');
  const [signupCity, setSignupCity] = useState('');
  const [signupState, setSignupState] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(() => {
    try { return localStorage.getItem(TERMS_ACCEPT_KEY) === '1'; } catch { return false; }
  });
  const [signupCode, setSignupCode] = useState('');
  const [resending, setResending] = useState(false);
  const [signupResendIn, setSignupResendIn] = useState(0);
  const [signupCodeAttempts, setSignupCodeAttempts] = useState(0);
  const [signupLockUntil, setSignupLockUntil] = useState(0);
  const [signupCodeSentAt, setSignupCodeSentAt] = useState(0);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetResendIn, setResetResendIn] = useState(0);
  const [resetCodeAttempts, setResetCodeAttempts] = useState(0);
  const [resetLockUntil, setResetLockUntil] = useState(0);
  const [resetCodeSentAt, setResetCodeSentAt] = useState(0);

  // Tick a "now" value once per second so status alerts stay current
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/agenda', { replace: true });
    }
  }, [user, navigate]);

  // Persist terms acceptance
  useEffect(() => {
    try {
      if (acceptedTerms) localStorage.setItem(TERMS_ACCEPT_KEY, '1');
      else localStorage.removeItem(TERMS_ACCEPT_KEY);
    } catch { /* ignore */ }
  }, [acceptedTerms]);

  // Countdown timers for OTP resend
  useEffect(() => {
    if (signupResendIn <= 0) return;
    const t = setTimeout(() => setSignupResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [signupResendIn]);

  useEffect(() => {
    if (resetResendIn <= 0) return;
    const t = setTimeout(() => setResetResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resetResendIn]);

  const resetSignupFlow = () => {
    setSignupStep('form');
    setAcceptedTerms(false);
    setSignupCode('');
  };

  const validateSignupForm = (): string | null => {
    if (!signupName.trim()) return 'Informe seu nome completo.';
    if (signupName.trim().split(/\s+/).length < 2) return 'Informe nome e sobrenome.';
    if (!isValidCPF(signupCpf)) return 'CPF inválido.';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim());
    if (!emailOk) return 'E-mail inválido.';
    if (signupPassword.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (signupPassword !== signupConfirmPassword) return 'As senhas não coincidem.';
    const cnpjDigits = signupCnpj.replace(/\D/g, '');
    if (cnpjDigits && cnpjDigits.length !== 14) return 'CNPJ inválido.';
    if (signupState && !BR_STATES.includes(signupState.toUpperCase())) return 'UF inválida.';
    return null;
  };

  const handleAdvanceToTerms = () => {
    const err = validateSignupForm();
    if (err) {
      toast({ title: 'Verifique os dados', description: err, variant: 'destructive' });
      return;
    }
    setSignupStep('terms');
  };

  const recordTermsAcceptance = async (email: string, userId?: string | null) => {
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const rows = ['terms_of_service', 'privacy_policy'].map((document) => ({
        user_id: userId ?? null,
        email,
        document,
        version: TERMS_VERSION,
        user_agent: ua,
        context: userId ? 'post_signup' : 'pre_signup',
      }));
      await supabase.from('terms_acceptances').insert(rows);
    } catch (e) {
      console.warn('[terms_acceptances] falha ao registrar aceite:', e);
    }
  };

  const handleSendSignupEmailCode = async () => {
    if (!acceptedTerms) {
      toast({ title: 'Aceite os termos', description: 'Marque o aceite dos Termos e da Política de Privacidade para continuar.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const email = signupEmail.trim().toLowerCase();
      // Registra aceite (auditável) já no envio do código, antes mesmo da criação da conta.
      await recordTermsAcceptance(email, null);
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email, type: 'signup' },
      });
      // Detecta e-mail já cadastrado (status 409) — não avança para o passo do código.
      let payload: any = data;
      if (error && (error as any)?.context?.json) {
        try { payload = await (error as any).context.json(); } catch { /* ignore */ }
      }
      if (payload?.code === 'email_exists') {
        toast({
          title: 'E-mail já cadastrado',
          description: "Faça login com sua senha ou use 'Esqueci minha senha' para recuperá-la.",
          variant: 'destructive',
        });
        setAuthView('login');
        setLoginEmail(email);
        return;
      }
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSignupStep('code');
      setSignupResendIn(OTP_RESEND_SECONDS);
      setSignupCodeAttempts(0);
      setSignupLockUntil(0);
      setSignupCodeSentAt(Date.now());
      toast({ title: 'Código enviado!', description: 'Confira seu e-mail.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar código';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (signupResendIn > 0) {
      toast({ title: 'Aguarde', description: `Você poderá reenviar em ${signupResendIn}s.`, variant: 'destructive' });
      return;
    }
    setResending(true);
    setSignupCode('');
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: signupEmail.trim().toLowerCase(), type: 'signup' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSignupResendIn(OTP_RESEND_SECONDS);
      setSignupCodeAttempts(0);
      setSignupLockUntil(0);
      setSignupCodeSentAt(Date.now());
      toast({ title: 'Novo código enviado', description: 'Verifique seu e-mail.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reenviar';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const handleConfirmSignupCode = async () => {
    if (signupCode.length !== 6) {
      toast({ title: 'Código incompleto', description: 'Digite os 6 dígitos.', variant: 'destructive' });
      return;
    }
    const tNow = Date.now();
    if (signupLockUntil && tNow < signupLockUntil) {
      const secs = Math.ceil((signupLockUntil - tNow) / 1000);
      toast({ title: 'Muitas tentativas', description: `Aguarde ${secs}s e solicite um novo código.`, variant: 'destructive' });
      return;
    }
    if (signupCodeSentAt && tNow - signupCodeSentAt > OTP_EXPIRY_SECONDS * 1000) {
      toast({ title: 'Código expirado', description: 'Solicite um novo código para continuar.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const email = signupEmail.trim().toLowerCase();
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-code', {
        body: { email, code: signupCode },
      });
      if (verifyError) throw verifyError;
      if (!verifyData?.valid) {
        const next = signupCodeAttempts + 1;
        setSignupCodeAttempts(next);
        const remaining = OTP_MAX_ATTEMPTS - next;
        if (remaining <= 0) {
          setSignupLockUntil(Date.now() + OTP_LOCKOUT_MS);
          toast({ title: 'Limite atingido', description: 'Solicite um novo código para tentar de novo.', variant: 'destructive' });
        } else {
          toast({ title: 'Código inválido', description: `${verifyData?.error || 'Confira o código.'} (${remaining} tentativa(s) restante(s))`, variant: 'destructive' });
        }
        return;
      }

      const { error: signUpError } = await signUp(email, signupPassword, signupName.trim(), {
        cpf: signupCpf.replace(/\D/g, ''),
        cnpj: signupCnpj.replace(/\D/g, '') || undefined,
        city: signupCity.trim() || undefined,
        state: signupState.trim().toUpperCase() || undefined,
      });
      if (signUpError) {
        // A conta pode ter sido criada mas o login automático falhou.
        // Tentamos mais uma vez antes de desistir.
        const { error: retryError } = await supabase.auth.signInWithPassword({ email, password: signupPassword });
        if (retryError) throw signUpError;
      }

      // Garante que existe uma sessão antes de prosseguir
      const { data: sessionData } = await supabase.auth.getUser();
      const uid = sessionData?.user?.id ?? null;
      if (uid) await recordTermsAcceptance(email, uid);

      toast({ title: 'Conta criada!', description: 'Bem-vindo(a) ao Lume Agenda.' });

      // Navegação explícita — não dependemos apenas do useEffect.
      navigate('/agenda', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
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
      setResetResendIn(OTP_RESEND_SECONDS);
      setResetCodeAttempts(0);
      setResetLockUntil(0);
      setResetCodeSentAt(Date.now());
      toast({ title: 'Código enviado!', description: 'Verifique seu email.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar código';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (resetResendIn > 0) {
      toast({ title: 'Aguarde', description: `Você poderá reenviar em ${resetResendIn}s.`, variant: 'destructive' });
      return;
    }
    setResending(true);
    setResetCode('');
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: forgotEmail, type: 'login' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResetResendIn(OTP_RESEND_SECONDS);
      setResetCodeAttempts(0);
      setResetLockUntil(0);
      setResetCodeSentAt(Date.now());
      toast({ title: 'Novo código enviado', description: 'Verifique seu email.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reenviar';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setResending(false);
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
    const tNow = Date.now();
    if (resetLockUntil && tNow < resetLockUntil) {
      const secs = Math.ceil((resetLockUntil - tNow) / 1000);
      toast({ title: 'Muitas tentativas', description: `Aguarde ${secs}s e solicite um novo código.`, variant: 'destructive' });
      return;
    }
    if (resetCodeSentAt && tNow - resetCodeSentAt > OTP_EXPIRY_SECONDS * 1000) {
      toast({ title: 'Código expirado', description: 'Solicite um novo código para continuar.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-code', {
        body: { email: forgotEmail, code: resetCode },
      });
      if (verifyError) throw verifyError;
      if (!verifyData?.valid) {
        const next = resetCodeAttempts + 1;
        setResetCodeAttempts(next);
        const remaining = OTP_MAX_ATTEMPTS - next;
        if (remaining <= 0) {
          setResetLockUntil(Date.now() + OTP_LOCKOUT_MS);
          toast({ title: 'Limite atingido', description: 'Solicite um novo código para tentar de novo.', variant: 'destructive' });
        } else {
          toast({ title: 'Código inválido', description: `${verifyData?.error || 'Confira o código.'} (${remaining} tentativa(s) restante(s))`, variant: 'destructive' });
        }
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

  const signupOtpStatus: OtpStatus = signupLockUntil > now
    ? { kind: 'blocked', until: signupLockUntil }
    : signupCodeSentAt && now - signupCodeSentAt > OTP_EXPIRY_SECONDS * 1000
      ? { kind: 'expired' }
      : signupCodeSentAt
        ? { kind: 'sent', at: signupCodeSentAt }
        : { kind: 'idle' };

  const resetOtpStatus: OtpStatus = resetLockUntil > now
    ? { kind: 'blocked', until: resetLockUntil }
    : resetCodeSentAt && now - resetCodeSentAt > OTP_EXPIRY_SECONDS * 1000
      ? { kind: 'expired' }
      : resetCodeSentAt
        ? { kind: 'sent', at: resetCodeSentAt }
        : { kind: 'idle' };

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
            <OtpStatusAlert status={resetOtpStatus} email={forgotEmail} now={now} />
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
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => { setAuthView('forgot-password'); setResetCode(''); setNewPassword(''); setConfirmNewPassword(''); }}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button type="button" className="text-primary hover:underline disabled:opacity-50" onClick={handleResendResetCode} disabled={resending || resetResendIn > 0}>
                {resending ? 'Reenviando...' : resetResendIn > 0 ? `Reenviar em ${resetResendIn}s` : 'Reenviar código'}
              </button>
            </div>
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
              {/* Etapa 1: Dados do cadastro */}
              {signupStep === 'form' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome completo *</Label>
                    <Input id="signup-name" type="text" placeholder="Nome e sobrenome" value={signupName} onChange={(e) => setSignupName(e.target.value)} autoComplete="name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-cpf">CPF *</Label>
                    <Input id="signup-cpf" type="text" inputMode="numeric" placeholder="000.000.000-00" value={signupCpf} onChange={(e) => setSignupCpf(maskCPF(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail *</Label>
                    <Input id="signup-email" type="email" placeholder="seu@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha *</Label>
                    <Input id="signup-password" type="password" placeholder="Mínimo 6 caracteres" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} autoComplete="new-password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirmar senha *</Label>
                    <Input id="signup-confirm-password" type="password" placeholder="Repita a senha" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} autoComplete="new-password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-cnpj">CNPJ <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input id="signup-cnpj" type="text" inputMode="numeric" placeholder="00.000.000/0000-00" value={signupCnpj} onChange={(e) => setSignupCnpj(maskCNPJ(e.target.value))} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="signup-city">Cidade <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                      <Input id="signup-city" type="text" placeholder="Sua cidade" value={signupCity} onChange={(e) => setSignupCity(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-state">UF</Label>
                      <Input id="signup-state" type="text" maxLength={2} placeholder="SP" value={signupState} onChange={(e) => setSignupState(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
                    </div>
                  </div>
                  <Button type="button" size="lg" className="w-full" onClick={handleAdvanceToTerms} disabled={loading}>
                    Cadastrar
                  </Button>
                </div>
              )}

              {/* Etapa 2: Termos + aceite */}
              {signupStep === 'terms' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-2">Termos e Política</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Para concluir o cadastro, leia e aceite os documentos abaixo.
                    </p>
                  </div>

                  <ScrollArea className="h-56 rounded-md border p-3 text-sm leading-relaxed">
                    <h4 className="font-semibold mb-1">Termos de Serviço</h4>
                    <p className="text-muted-foreground mb-3">
                      Ao utilizar o Lume Agenda você concorda com as regras de uso do sistema, responsabilidades sobre dados cadastrados, cobrança após o período de teste gratuito e demais condições descritas integralmente em nossa página oficial.{" "}
                      <Link to="/termos-de-servico" target="_blank" className="text-primary hover:underline">Ler na íntegra</Link>.
                    </p>

                    <h4 className="font-semibold mb-1 mt-3">Política de Privacidade</h4>
                    <p className="text-muted-foreground">
                      Tratamos seus dados em conformidade com a LGPD. Coletamos apenas o necessário para operar a agenda, jamais comercializamos seus dados e você pode solicitar exclusão a qualquer momento.{" "}
                      <Link to="/politica-de-privacidade" target="_blank" className="text-primary hover:underline">Ler na íntegra</Link>.
                    </p>
                  </ScrollArea>

                  <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                    <Checkbox checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(v === true)} className="mt-0.5" />
                    <span>
                      Li e concordo com os <Link to="/termos-de-servico" target="_blank" className="text-primary hover:underline">Termos de Serviço</Link> e com a{" "}
                      <Link to="/politica-de-privacidade" target="_blank" className="text-primary hover:underline">Política de Privacidade</Link>.
                    </span>
                  </label>

                  <Button type="button" size="lg" className="w-full" onClick={handleSendSignupEmailCode} disabled={loading || !acceptedTerms}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                    Receber código por e-mail
                  </Button>

                  <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1" onClick={() => setSignupStep('form')}>
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                </div>
              )}

              {/* Etapa 3: Código de e-mail */}
              {signupStep === 'code' && (
                <div className="space-y-6">
                  <OtpStatusAlert status={signupOtpStatus} email={signupEmail} now={now} />

                  <div className="space-y-2 text-center">
                    <Label className="block">Digite o código de 6 dígitos</Label>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={signupCode} onChange={setSignupCode}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                          <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  <Button type="button" size="lg" className="w-full" onClick={handleConfirmSignupCode} disabled={loading || signupCode.length !== 6}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar e criar conta
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button type="button" className="text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => setSignupStep('terms')}>
                      <ArrowLeft className="h-4 w-4" /> Voltar
                    </button>
                    <button type="button" className="text-primary hover:underline disabled:opacity-50" onClick={handleResendSignupCode} disabled={resending || signupResendIn > 0}>
                      {resending ? 'Reenviando...' : signupResendIn > 0 ? `Reenviar em ${signupResendIn}s` : 'Reenviar código'}
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

export default function Auth() {
  return (
    <AuthErrorBoundary>
      <AuthInner />
    </AuthErrorBoundary>
  );
}
