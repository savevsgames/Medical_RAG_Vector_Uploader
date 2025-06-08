import { useState, useCallback } from 'react';

interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
}

interface UseFormStateOptions<T> {
  initialValues: T;
  validationRules?: Partial<Record<keyof T, any>>;
  onSubmit?: (values: T) => Promise<void> | void;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export function useFormState<T extends Record<string, any>>({
  initialValues,
  validationRules = {},
  onSubmit,
  validateOnChange = false,
  validateOnBlur = true
}: UseFormStateOptions<T>) {
  const [formState, setFormState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    touched: {},
    isSubmitting: false,
    isValid: true
  });

  const validateField = useCallback((name: keyof T, value: any) => {
    const rules = validationRules[name];
    if (!rules) return null;

    // Required validation
    if (rules.required && (!value || (typeof value === 'string' && value.trim().length === 0))) {
      return 'This field is required';
    }

    // Email validation
    if (rules.email && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
    }

    // Min length validation
    if (rules.minLength && value && value.length < rules.minLength) {
      return `Must be at least ${rules.minLength} characters`;
    }

    // Custom validation
    if (rules.custom && typeof rules.custom === 'function') {
      return rules.custom(value);
    }

    return null;
  }, [validationRules]);

  const validateForm = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(formState.values).forEach((key) => {
      const error = validateField(key as keyof T, formState.values[key as keyof T]);
      if (error) {
        newErrors[key as keyof T] = error;
        isValid = false;
      }
    });

    setFormState(prev => ({
      ...prev,
      errors: newErrors,
      isValid
    }));

    return isValid;
  }, [formState.values, validateField]);

  const setValue = useCallback((name: keyof T, value: any) => {
    setFormState(prev => {
      const newValues = { ...prev.values, [name]: value };
      const newErrors = { ...prev.errors };
      
      // Validate on change if enabled
      if (validateOnChange) {
        const error = validateField(name, value);
        if (error) {
          newErrors[name] = error;
        } else {
          delete newErrors[name];
        }
      } else if (prev.errors[name]) {
        // Clear error if field was previously invalid
        delete newErrors[name];
      }

      const isValid = Object.keys(newErrors).length === 0;

      return {
        ...prev,
        values: newValues,
        errors: newErrors,
        isValid
      };
    });
  }, [validateField, validateOnChange]);

  const setTouched = useCallback((name: keyof T, touched = true) => {
    setFormState(prev => {
      const newTouched = { ...prev.touched, [name]: touched };
      const newErrors = { ...prev.errors };

      // Validate on blur if enabled and field is touched
      if (validateOnBlur && touched) {
        const error = validateField(name, prev.values[name]);
        if (error) {
          newErrors[name] = error;
        } else {
          delete newErrors[name];
        }
      }

      const isValid = Object.keys(newErrors).length === 0;

      return {
        ...prev,
        touched: newTouched,
        errors: newErrors,
        isValid
      };
    });
  }, [validateField, validateOnBlur]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!onSubmit) {
      return;
    }

    setFormState(prev => ({ ...prev, isSubmitting: true }));

    try {
      await onSubmit(formState.values);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setFormState(prev => ({ ...prev, isSubmitting: false }));
    }
  }, [formState.values, onSubmit, validateForm]);

  const reset = useCallback(() => {
    setFormState({
      values: initialValues,
      errors: {},
      touched: {},
      isSubmitting: false,
      isValid: true
    });
  }, [initialValues]);

  return {
    ...formState,
    setValue,
    setTouched,
    validateForm,
    handleSubmit,
    reset
  };
}