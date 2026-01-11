import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, Mail, ArrowLeft, CheckCircle2, Crown, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Badge } from '@/components/ui/badge';

type AuthStep = 'email' | 'code' | 'plan' | 'password';

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Auth flow state
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

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
      navigate('/');
    }
  }, [user, navigate]);

  const handleSendVerificationCode = async () => {
    if (!signupEmail) {
      toast({ title: 'Erro', description: 'Digite seu email', variant: 'destructive' });
      return;
    }

    if (!signupName) {
      toast({ title: 'Erro', description: 'Digite seu nome', variant: 'destructive' });
      return;
    }

    setLoading(true);
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
      setAuthStep('plan');
      toast({ 
        title: 'Email verificado!', 
        description: 'Agora escolha seu plano.' 
      });
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      toast({ 
        title: 'Erro ao entrar', 
        description: error.message === 'Invalid login credentials' 
          ? 'Email ou senha incorretos' 
          : error.message, 
        variant: 'destructive' 
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!codeVerified) {
      toast({ title: 'Erro', description: 'Primeiro verifique seu email', variant: 'destructive' });
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
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast({ title: 'Erro', description: 'Este email já está cadastrado', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ 
        title: 'Cadastro realizado!', 
        description: 'Sua conta foi criada com sucesso.' 
      });
    }
  };

  const resetSignupFlow = () => {
    setAuthStep('email');
    setVerificationCode('');
    setCodeVerified(false);
    setSelectedPlan('');
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

  return (
    <div className="flex min-h-screen items-center justify-center gradient-hero p-4">
      <Card className={`w-full shadow-lg animate-scale-in ${authStep === 'plan' ? 'max-w-lg' : 'max-w-md'}`}>
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Agenda Mais</CardTitle>
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
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {/* Step 1: Email and Name */}
              {authStep === 'email' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome completo</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Seu nome"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Celular</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                    />
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
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
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
                      <Crown className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Plano {plans.find(p => p.id === selectedPlan)?.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Crie sua senha para finalizar o cadastro
                    </p>
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      7 dias grátis inclusos
                    </Badge>
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
                    <Label htmlFor="signup-confirm">Confirmar senha</Label>
                    <Input
                      id="signup-confirm"
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
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={() => setAuthStep('plan')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Escolher outro plano
                  </button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
