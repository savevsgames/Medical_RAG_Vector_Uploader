import React from 'react';
import { DocumentModal } from './DocumentModal';
import { DocumentMetadataForm } from '../forms';

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

interface DocumentEditModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedDocument: Document) => void;
}

export function DocumentEditModal({ document, isOpen, onClose, onSave }: DocumentEditModalProps) {
  if (!document) return null;

  const handleSubmit = async (filename: string, metadata: Record<string, any>) => {
    const updatedDocument = {
      ...document,
      filename,
      metadata
    };
    
    onSave(updatedDocument);
  };

  // Extract system metadata
  const systemKeys = ['char_count', 'page_count', 'file_size', 'mime_type', 'embedding_source', 'processing_time_ms'];
  const systemMetadata = Object.entries(document.metadata)
    .filter(([key]) => systemKeys.includes(key))
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

  return (
    <DocumentModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Document"
      size="lg"
    >
      <div className="p-6">
        <DocumentMetadataForm
          initialFilename={document.filename}
          initialMetadata={document.metadata}
          systemMetadata={systemMetadata}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </DocumentModal>
  );
}