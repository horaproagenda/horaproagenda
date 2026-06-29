import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, AppRole } from '@/types';
import { revalidateVersionAfterAuth } from '@/lib/bootVersionGuard';

type SignupMetadata = {
  phone?: string;
  cpf?: string;
  companyName?: string;
  cnpj?: string;
  city?: string;
  state?: string;
  selectedPlan?: string;
  code?: string;
  // Dados da clínica e endereço (vão para business_settings + primeiro profissional)
  clinicName?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  clinicCep?: string;
  clinicStreet?: string;
  clinicNumber?: string;
  clinicComplement?: string;
  clinicNeighborhood?: string;
  clinicCity?: string;
  clinicState?: string;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, metadata?: SignupMetadata) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer Supabase calls with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }

        // Após login/logout/refresh, revalida versão do bundle.
        // Garante que nunca operemos com build antigo após troca de sessão.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setTimeout(() => {
            void revalidateVersionAfterAuth(`auth:${event}`);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesData) {
        setRoles(rolesData.map(r => r.role as AppRole));
      }

      // Garante que o profissional logado fique vinculado ao seu registro mesmo se
      // o cadastro tiver sido criado apenas com o e-mail. Funciona em qualquer
      // dispositivo (mobile, tablet, desktop, iOS, Android).
      try {
        await supabase.rpc('link_current_user_professional');
      } catch (linkError) {
        console.warn('link_current_user_professional não disponível:', linkError);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };


  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, metadata: SignupMetadata = {}) => {
    const { data, error } = await supabase.functions.invoke('complete-signup', {
      body: { email, password, fullName, ...metadata },
    });

    if (error) {
      // Tenta extrair payload JSON do erro (FunctionsHttpError mantém o body)
      let payload: any = null;
      try { payload = await (error as any)?.context?.json?.(); } catch { /* ignore */ }
      if (payload?.code === 'email_exists') {
        const err = new Error(payload.error || 'E-mail já cadastrado') as Error & { code?: string };
        err.code = 'email_exists';
        return { error: err };
      }
      if (payload?.error) {
        const err = new Error(payload.error) as Error & { code?: string };
        if (payload.code) err.code = payload.code;
        return { error: err };
      }
      return { error: error as Error };
    }

    if (!data?.success) {
      if (data?.code === 'email_exists') {
        const err = new Error(data.error || 'E-mail já cadastrado') as Error & { code?: string };
        err.code = 'email_exists';
        return { error: err };
      }
      return { error: new Error(data?.error || 'Erro ao cadastrar') };
    }

    // Tenta o login automático. Em casos raros (replicação de auth) o primeiro
    // signIn pode falhar — tentamos uma segunda vez após uma breve espera.
    let { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      await new Promise((r) => setTimeout(r, 800));
      const retry = await supabase.auth.signInWithPassword({ email, password });
      signInError = retry.error;
    }
    return { error: signInError as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      roles, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      hasRole 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}