import React from 'react';
import { ValidatedInput } from './ValidatedInput';
import { ValidatedTextarea } from './ValidatedTextarea';
import { FormActions } from './FormActions';
import { useFormState } from './hooks/useFormState';

interface DocumentMetadataFormProps {
  initialFilename: string;
  initialMetadata: Record<string, any>;
  onSubmit: (filename: string, metadata: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  systemMetadata?: Record<string, any>;
}

interface DocumentFormData {
  filename: string;
  customMetadataJson: string;
}

export function DocumentMetadataForm({
  initialFilename,
  initialMetadata,
  onSubmit,
  onCancel,
  systemMetadata = {}
}: DocumentMetadataFormProps) {
  // Extract custom metadata (non-system fields)
  const systemKeys = ['char_count', 'page_count', 'file_size', 'mime_type', 'embedding_source', 'processing_time_ms'];
  const customMeta = Object.entries(initialMetadata)
    .filter(([key]) => !systemKeys.includes(key))
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

  const {
    values,
    errors,
    isSubmitting,
    isValid,
    setValue,
    setTouched,
    handleSubmit
  } = useFormState<DocumentFormData>({
    initialValues: {
      filename: initialFilename,
      customMetadataJson: JSON.stringify(customMeta, null, 2)
    },
    validationRules: {
      filename: {
        required: true
      },
      customMetadataJson: {
        json: true
      }
    },
    onSubmit: async (formValues) => {
      let parsedMetadata = {};
      if (formValues.customMetadataJson.trim()) {
        parsedMetadata = JSON.parse(formValues.customMetadataJson);
      }

      const mergedMetadata = {
        ...systemMetadata,
        ...parsedMetadata
      };

      await onSubmit(formValues.filename, mergedMetadata);
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ValidatedInput
        label="Filename"
        placeholder="Enter filename"
        value={values.filename}
        onChange={(e) => setValue('filename', e.target.value)}
        onBlur={() => setTouched('filename')}
        validationRules={{
          required: true
        }}
        fullWidth
      />

      {/* System Metadata (Read-only) */}
      {Object.keys(systemMetadata).length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Metadata (Read-only)
          </label>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {systemMetadata.char_count && (
                <div>
                  <span className="text-gray-500">Characters:</span>
                  <span className="ml-2 font-medium">{systemMetadata.char_count.toLocaleString()}</span>
                </div>
              )}
              {systemMetadata.page_count && (
                <div>
                  <span className="text-gray-500">Pages:</span>
                  <span className="ml-2 font-medium">{systemMetadata.page_count}</span>
                </div>
              )}
              {systemMetadata.file_size && (
                <div>
                  <span className="text-gray-500">File Size:</span>
                  <span className="ml-2 font-medium">
                    {(systemMetadata.file_size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
              {systemMetadata.mime_type && (
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-2 font-medium">{systemMetadata.mime_type}</span>
                </div>
              )}
              {systemMetadata.embedding_source && (
                <div>
                  <span className="text-gray-500">Embedding:</span>
                  <span className="ml-2 font-medium">{systemMetadata.embedding_source}</span>
                </div>
              )}
              {systemMetadata.processing_time_ms && (
                <div>
                  <span className="text-gray-500">Processing Time:</span>
                  <span className="ml-2 font-medium">{systemMetadata.processing_time_ms}ms</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ValidatedTextarea
        label="Custom Metadata (JSON)"
        placeholder='{\n  "category": "cardiology",\n  "author": "Dr. Smith",\n  "tags": ["research", "clinical"]\n}'
        value={values.customMetadataJson}
        onChange={(e) => setValue('customMetadataJson', e.target.value)}
        onBlur={() => setTouched('customMetadataJson')}
        validationRules={{
          json: true
        }}
        helperText="Add custom metadata as JSON. This will be merged with system metadata."
        rows={8}
        fullWidth
      />

      <FormActions
        onSubmit={handleSubmit}
        onCancel={onCancel}
        submitLabel="Save Changes"
        cancelLabel="Cancel"
        isSubmitting={isSubmitting}
        isValid={isValid}
        alignment="right"
      />
    </form>
  );
}