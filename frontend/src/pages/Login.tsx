import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { logger, logUserAction, logSupabaseOperation } from '../utils/logger';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

        // Navigate to root path, which will redirect to /chat for authenticated users
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
      console.error('Auth error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-500"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}