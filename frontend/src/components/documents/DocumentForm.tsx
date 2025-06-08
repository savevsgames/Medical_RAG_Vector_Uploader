import React, { useState, useEffect } from 'react';
import { Input, Textarea, Button } from '../ui';
import { useDocumentForm } from './hooks/useDocumentForm';

interface Document {
  id: string;
  filename: string;
  content: string;
  metadata: {
    char_count: number;
    page_count?: number;
    file_size?: number;
    mime_type?: string;
    embedding_source?: string;
    processing_time_ms?: number;
    [key: string]: any;
  };
  created_at: string;
}

interface DocumentFormProps {
  document: Document;
  onSave: (updatedDocument: Document) => void;
  onCancel: () => void;
}

export function DocumentForm({ document, onSave, onCancel }: DocumentFormProps) {
  const {
    formData,
    errors,
    isSubmitting,
    updateField,
    validateForm,
    resetForm
  } = useDocumentForm(document);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      const updatedDocument = {
        ...document,
        filename: formData.filename,
        metadata: {
          ...document.metadata,
          ...formData.customMetadata
        }
      };

      await onSave(updatedDocument);
    } catch (error) {
      console.error('Failed to save document:', error);
    }
  };

  const systemMetadata = {
    char_count: document.metadata.char_count,
    page_count: document.metadata.page_count,
    file_size: document.metadata.file_size,
    mime_type: document.metadata.mime_type,
    embedding_source: document.metadata.embedding_source,
    processing_time_ms: document.metadata.processing_time_ms
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Filename */}
      <Input
        label="Filename"
        value={formData.filename}
        onChange={(e) => updateField('filename', e.target.value)}
        error={errors.filename}
        placeholder="Enter filename"
        fullWidth
      />

      {/* System Metadata (Read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          System Metadata (Read-only)
        </label>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Characters:</span>
              <span className="ml-2 font-medium">{systemMetadata.char_count?.toLocaleString()}</span>
            </div>
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

      {/* Custom Metadata */}
      <Textarea
        label="Custom Metadata (JSON)"
        value={formData.customMetadataJson}
        onChange={(e) => updateField('customMetadataJson', e.target.value)}
        error={errors.customMetadataJson}
        placeholder='{\n  "category": "cardiology",\n  "author": "Dr. Smith",\n  "tags": ["research", "clinical"]\n}'
        rows={8}
        fullWidth
        helperText="Add custom metadata as JSON. This will be merged with system metadata."
      />

      {/* Document Info */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Document Information</h4>
        <div className="text-sm text-blue-800 space-y-1">
          <div>ID: <span className="font-mono">{document.id}</span></div>
          <div>Created: {new Date(document.created_at).toLocaleString()}</div>
          <div>Content Length: {document.content.length.toLocaleString()} characters</div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          loading={isSubmitting}
          disabled={!formData.filename.trim()}
        >
          Save Changes
        </Button>
      </div>
    </form>
  );
}