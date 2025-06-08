import React from 'react';
import { ValidatedInput } from './ValidatedInput';
import { FormActions } from './FormActions';
import { useFormState } from './hooks/useFormState';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  isSignUp?: boolean;
  onToggleMode?: () => void;
}

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginForm({ onSubmit, isSignUp = false, onToggleMode }: LoginFormProps) {
  const {
    values,
    errors,
    isSubmitting,
    isValid,
    setValue,
    setTouched,
    handleSubmit
  } = useFormState<LoginFormData>({
    initialValues: {
      email: '',
      password: ''
    },
    validationRules: {
      email: {
        required: true,
        email: true
      },
      password: {
        required: true,
        minLength: isSignUp ? 6 : 1
      }
    },
    onSubmit: async (formValues) => {
      await onSubmit(formValues.email, formValues.password);
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ValidatedInput
        type="email"
        label="Email address"
        placeholder="Enter your email"
        value={values.email}
        onChange={(e) => setValue('email', e.target.value)}
        onBlur={() => setTouched('email')}
        validationRules={{
          required: true,
          email: true
        }}
        fullWidth
      />

      <ValidatedInput
        type="password"
        label="Password"
        placeholder="Enter your password"
        value={values.password}
        onChange={(e) => setValue('password', e.target.value)}
        onBlur={() => setTouched('password')}
        validationRules={{
          required: true,
          minLength: isSignUp ? 6 : 1
        }}
        helperText={isSignUp ? 'Password must be at least 6 characters' : undefined}
        fullWidth
      />

      <FormActions
        onSubmit={handleSubmit}
        submitLabel={isSignUp ? 'Sign up' : 'Sign in'}
        isSubmitting={isSubmitting}
        isValid={isValid}
        className="w-full"
      />

      {onToggleMode && (
        <div className="text-center">
          <button
            type="button"
            className="text-sm text-blue-600 hover:text-blue-500"
            onClick={onToggleMode}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      )}
    </form>
  );
}