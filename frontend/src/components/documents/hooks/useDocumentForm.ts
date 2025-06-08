import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { logger, logUserAction } from '../../../utils/logger';
import toast from 'react-hot-toast';

interface Document {
  id: string;
  filename: string;
  metadata: Record<string, any>;
  [key: string]: any;
}

interface FormData {
  filename: string;
  customMetadataJson: string;
  customMetadata: Record<string, any>;
}

interface FormErrors {
  filename?: string;
  customMetadataJson?: string;
}

export function useDocumentForm(document: Document) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Extract custom metadata (non-system fields)
  const systemKeys = ['char_count', 'page_count', 'file_size', 'mime_type', 'embedding_source', 'processing_time_ms'];
  const customMeta = Object.entries(document.metadata)
    .filter(([key]) => !systemKeys.includes(key))
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

  const [formData, setFormData] = useState<FormData>({
    filename: document.filename,
    customMetadataJson: JSON.stringify(customMeta, null, 2),
    customMetadata: customMeta
  });

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Parse JSON for custom metadata
    if (field === 'customMetadataJson') {
      try {
        const parsed = value.trim() ? JSON.parse(value) : {};
        setFormData(prev => ({ ...prev, customMetadata: parsed }));
      } catch (error) {
        // JSON parsing will be validated on submit
      }
    }
  }, [errors]);

  const validateForm = useCallback(() => {
    const newErrors: FormErrors = {};

    if (!formData.filename.trim()) {
      newErrors.filename = 'Filename is required';
    }

    if (formData.customMetadataJson.trim()) {
      try {
        JSON.parse(formData.customMetadataJson);
      } catch (error) {
        newErrors.customMetadataJson = 'Invalid JSON format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const resetForm = useCallback(() => {
    setFormData({
      filename: document.filename,
      customMetadataJson: JSON.stringify(customMeta, null, 2),
      customMetadata: customMeta
    });
    setErrors({});
  }, [document.filename, customMeta]);

  const saveDocument = useCallback(async (updatedDocument: Document) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          filename: updatedDocument.filename,
          metadata: updatedDocument.metadata
        })
        .eq('id', updatedDocument.id)
        .select()
        .single();

      if (error) throw error;

      logUserAction('Document Updated', null, {
        documentId: updatedDocument.id,
        oldFilename: document.filename,
        newFilename: updatedDocument.filename,
        component: 'useDocumentForm'
      });

      toast.success('Document updated successfully');
      return data;

    } catch (error) {
      logger.error('Failed to update document', {
        component: 'useDocumentForm',
        documentId: document.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to update document');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [document.filename, document.id]);

  return {
    formData,
    errors,
    isSubmitting,
    updateField,
    validateForm,
    resetForm,
    saveDocument
  };
}