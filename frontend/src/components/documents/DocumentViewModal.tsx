import React from 'react';
import { DocumentModal } from './DocumentModal';
import { DocumentViewer } from './DocumentViewer';

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
  };
  created_at: string;
}

interface DocumentViewModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentViewModal({ document, isOpen, onClose }: DocumentViewModalProps) {
  if (!document) return null;

  return (
    <DocumentModal
      isOpen={isOpen}
      onClose={onClose}
      title={document.filename}
      size="xl"
    >
      <div className="p-6">
        <DocumentViewer document={document} />
      </div>
    </DocumentModal>
  );
}