import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { LoginForm } from '../components/forms';
import toast from 'react-hot-toast';
import { logger, logUserAction, logSupabaseOperation } from '../utils/logger';

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (email: string, password: string) => {
    logger.info(`${isSignUp ? 'Sign up' : 'Sign in'} attempt`, {
      component: 'Login',
      email,
      isSignUp
    });

    try {
      if (isSignUp) {
        logUserAction('Sign Up Initiated', email, {
          component: 'Login'
        });

        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) {
          logSupabaseOperation('signUp', email, 'error', {
            error: error.message,
            code: error.status,
            component: 'Login'
          });
          throw error;
        }

        logSupabaseOperation('signUp', email, 'success', {
          component: 'Login'
        });

        toast.success('Account created! Please check your email to verify your account.');
      } else {
        logUserAction('Sign In Initiated', email, {
          component: 'Login'
        });

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          logSupabaseOperation('signIn', email, 'error', {
            error: error.message,
            code: error.status,
            component: 'Login'
          });
          throw error;
        }

        logSupabaseOperation('signIn', email, 'success', {
          component: 'Login'
        });

        logUserAction('Sign In Success - Redirecting', email, {
          component: 'Login',
          redirectTo: '/'
        });

        navigate('/');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      
      logger.error(`${isSignUp ? 'Sign up' : 'Sign in'} failed`, {
        component: 'Login',
        email,
        error: errorMessage,
        isSignUp
      });

      toast.error(isSignUp ? 'Failed to sign up' : 'Failed to sign in');
      throw error; // Re-throw to let the form handle the error state
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-blue to-cloud-ivory py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img 
              src="/logo_transparent.png" 
              alt="Symptom Savior Logo" 
              className="w-16 h-16 object-contain glow-effect"
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-heading font-bold text-deep-midnight">
            {isSignUp ? 'Join Symptom Savior' : 'Welcome back to Symptom Savior'}
          </h2>
          <p className="mt-2 text-center text-sm text-soft-gray font-body">
            {isSignUp ? 'Create your account to access the Smart MedDoc Portal' : 'Sign in to your Smart MedDoc Portal'}
          </p>
        </div>
        
        <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-8">
          <LoginForm
            onSubmit={handleSubmit}
            isSignUp={isSignUp}
            onToggleMode={() => setIsSignUp(!isSignUp)}
          />
        </div>
      </div>
    </div>
  );
}