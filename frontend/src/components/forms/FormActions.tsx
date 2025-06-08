import React from 'react';
import { Button } from '../ui/Button';

interface FormActionsProps {
  onSubmit?: () => void;
  onCancel?: () => void;
  onReset?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  resetLabel?: string;
  isSubmitting?: boolean;
  isValid?: boolean;
  submitDisabled?: boolean;
  className?: string;
  layout?: 'horizontal' | 'vertical';
  alignment?: 'left' | 'center' | 'right' | 'between';
}

export function FormActions({
  onSubmit,
  onCancel,
  onReset,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  resetLabel = 'Reset',
  isSubmitting = false,
  isValid = true,
  submitDisabled = false,
  className = '',
  layout = 'horizontal',
  alignment = 'right'
}: FormActionsProps) {
  const layoutClasses = layout === 'horizontal' ? 'flex' : 'flex flex-col';
  const spacingClasses = layout === 'horizontal' ? 'space-x-3' : 'space-y-3';
  
  const alignmentClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between'
  };

  return (
    <div className={`${layoutClasses} ${spacingClasses} ${alignmentClasses[alignment]} ${className}`}>
      {onReset && (
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          disabled={isSubmitting}
        >
          {resetLabel}
        </Button>
      )}
      
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {cancelLabel}
        </Button>
      )}
      
      {onSubmit && (
        <Button
          type="submit"
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={submitDisabled || !isValid}
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
}