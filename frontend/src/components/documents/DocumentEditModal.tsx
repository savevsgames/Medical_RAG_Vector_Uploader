import React from 'react';
import { DocumentModal } from './DocumentModal';
import { DocumentForm } from './DocumentForm';

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

  return (
    <DocumentModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Document"
      size="lg"
    >
      <div className="p-6">
        <DocumentForm
          document={document}
          onSave={onSave}
          onCancel={onClose}
        />
      </div>
    </DocumentModal>
  );
}