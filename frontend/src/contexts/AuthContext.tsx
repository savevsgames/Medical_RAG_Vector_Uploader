import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { logger, logSupabaseOperation, logUserAction } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logger.info('AuthProvider initializing', {
      component: 'AuthProvider',
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        logSupabaseOperation('getSession', null, 'error', {
          error: error.message,
          code: error.status
        });
      } else {
        logSupabaseOperation('getSession', session?.user?.email || null, 'success', {
          hasSession: !!session,
          userId: session?.user?.id,
          userEmail: session?.user?.email
        });
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info(`Auth state change: ${event}`, {
          component: 'AuthProvider',
          event,
          hasSession: !!session,
          userId: session?.user?.id,
          userEmail: session?.user?.email
        });

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === 'SIGNED_IN') {
          logUserAction('Sign In', session?.user?.email || null, {
            userId: session?.user?.id,
            provider: session?.user?.app_metadata?.provider
          });
          toast.success('Successfully signed in!');
        } else if (event === 'SIGNED_OUT') {
          logUserAction('Sign Out', null, {
            previousUser: user?.email
          });
          toast.success('Successfully signed out!');
        } else if (event === 'TOKEN_REFRESHED') {
          logger.debug('Token refreshed', {
            component: 'AuthProvider',
            userId: session?.user?.id,
            userEmail: session?.user?.email
          });
        }
      }
    );

    return () => {
      logger.debug('AuthProvider cleanup', { component: 'AuthProvider' });
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const currentUser = user?.email;
    
    logUserAction('Sign Out Initiated', currentUser, {
      component: 'AuthProvider'
    });

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        logSupabaseOperation('signOut', currentUser, 'error', {
          error: error.message,
          code: error.status
        });
        throw error;
      }

      logSupabaseOperation('signOut', currentUser, 'success');
    } catch (error) {
      logger.error('Sign out failed', {
        component: 'AuthProvider',
        user: currentUser,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Error signing out');
      console.error('Sign out error:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
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