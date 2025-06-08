import React, { forwardRef } from 'react';
import { Input } from '../ui/Input';
import { FormField } from './FormField';
import { useFormValidation } from './hooks/useFormValidation';

interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  validationRules?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    email?: boolean;
    custom?: (value: string) => string | null;
  };
  onValidationChange?: (isValid: boolean, error?: string) => void;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(({
  label,
  helperText,
  validationRules,
  onValidationChange,
  validateOnBlur = true,
  validateOnChange = false,
  className = '',
  ...props
}, ref) => {
  const {
    error,
    isValid,
    validate,
    clearError
  } = useFormValidation(validationRules, onValidationChange);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (validateOnBlur) {
      validate(e.target.value);
    }
    props.onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (validateOnChange) {
      validate(e.target.value);
    } else if (error) {
      clearError();
    }
    props.onChange?.(e);
  };

  return (
    <FormField
      label={label}
      error={error}
      helperText={helperText}
      required={validationRules?.required}
      className={className}
    >
      <Input
        ref={ref}
        {...props}
        onBlur={handleBlur}
        onChange={handleChange}
        className={error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}
      />
    </FormField>
  );
});

ValidatedInput.displayName = 'ValidatedInput';