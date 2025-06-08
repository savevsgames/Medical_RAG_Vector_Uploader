import React, { forwardRef } from 'react';
import { Textarea } from '../ui/Textarea';
import { FormField } from './FormField';
import { useFormValidation } from './hooks/useFormValidation';

interface ValidatedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  validationRules?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    json?: boolean;
    custom?: (value: string) => string | null;
  };
  onValidationChange?: (isValid: boolean, error?: string) => void;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

export const ValidatedTextarea = forwardRef<HTMLTextAreaElement, ValidatedTextareaProps>(({
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

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (validateOnBlur) {
      validate(e.target.value);
    }
    props.onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
      <Textarea
        ref={ref}
        {...props}
        onBlur={handleBlur}
        onChange={handleChange}
        className={error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}
      />
    </FormField>
  );
});

ValidatedTextarea.displayName = 'ValidatedTextarea';