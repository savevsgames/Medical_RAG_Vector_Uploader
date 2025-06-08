import { useState, useCallback } from 'react';

interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  email?: boolean;
  json?: boolean;
  custom?: (value: string) => string | null;
}

export function useFormValidation(
  rules?: ValidationRules,
  onValidationChange?: (isValid: boolean, error?: string) => void
) {
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  const validate = useCallback((value: string) => {
    if (!rules) {
      setError(null);
      setIsValid(true);
      onValidationChange?.(true);
      return true;
    }

    // Required validation
    if (rules.required && (!value || value.trim().length === 0)) {
      const errorMsg = 'This field is required';
      setError(errorMsg);
      setIsValid(false);
      onValidationChange?.(false, errorMsg);
      return false;
    }

    // Skip other validations if field is empty and not required
    if (!value || value.trim().length === 0) {
      setError(null);
      setIsValid(true);
      onValidationChange?.(true);
      return true;
    }

    // Min length validation
    if (rules.minLength && value.length < rules.minLength) {
      const errorMsg = `Must be at least ${rules.minLength} characters`;
      setError(errorMsg);
      setIsValid(false);
      onValidationChange?.(false, errorMsg);
      return false;
    }

    // Max length validation
    if (rules.maxLength && value.length > rules.maxLength) {
      const errorMsg = `Must be no more than ${rules.maxLength} characters`;
      setError(errorMsg);
      setIsValid(false);
      onValidationChange?.(false, errorMsg);
      return false;
    }

    // Email validation
    if (rules.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        const errorMsg = 'Please enter a valid email address';
        setError(errorMsg);
        setIsValid(false);
        onValidationChange?.(false, errorMsg);
        return false;
      }
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      const errorMsg = 'Please enter a valid format';
      setError(errorMsg);
      setIsValid(false);
      onValidationChange?.(false, errorMsg);
      return false;
    }

    // JSON validation
    if (rules.json) {
      try {
        JSON.parse(value);
      } catch (e) {
        const errorMsg = 'Please enter valid JSON';
        setError(errorMsg);
        setIsValid(false);
        onValidationChange?.(false, errorMsg);
        return false;
      }
    }

    // Custom validation
    if (rules.custom) {
      const customError = rules.custom(value);
      if (customError) {
        setError(customError);
        setIsValid(false);
        onValidationChange?.(false, customError);
        return false;
      }
    }

    // All validations passed
    setError(null);
    setIsValid(true);
    onValidationChange?.(true);
    return true;
  }, [rules, onValidationChange]);

  const clearError = useCallback(() => {
    setError(null);
    setIsValid(true);
    onValidationChange?.(true);
  }, [onValidationChange]);

  return {
    error,
    isValid,
    validate,
    clearError
  };
}