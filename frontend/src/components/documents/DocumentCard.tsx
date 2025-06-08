import React from 'react';
import { FileText, Calendar, MoreVertical } from 'lucide-react';
import { Card, Badge } from '../ui';
import { DocumentActions } from './DocumentActions';
import { useDocumentActions } from './hooks/useDocumentActions';

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

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => void;
  onEdit: (document: Document) => void;
  onView: (document: Document) => void;
}

export function DocumentCard({ document, onDelete, onEdit, onView }: DocumentCardProps) {
  const { isDeleting, handleDelete } = useDocumentActions();

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('word')) return '📝';
    if (mimeType?.includes('text')) return '📃';
    return '📄';
  };

  const getEmbeddingBadge = (source?: string) => {
    switch (source) {
      case 'runpod':
        return <Badge variant="info">BioBERT</Badge>;
      case 'openai':
      case 'local':
        return <Badge variant="success">OpenAI</Badge>;
      case 'local_with_runpod_processing':
        return <Badge variant="purple">Hybrid</Badge>;
      default:
        return <Badge variant="default">Unknown</Badge>;
    }
  };

  const onDeleteClick = async () => {
    await handleDelete(document.id, document.filename, onDelete);
  };

  return (
    <Card hover className="relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="text-2xl">{getFileIcon(document.metadata.mime_type)}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate" title={document.filename}>
              {document.filename}
            </h3>
            <div className="flex items-center space-x-4 mt-1">
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="w-4 h-4 mr-1" />
                {new Date(document.created_at).toLocaleDateString()}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <FileText className="w-4 h-4 mr-1" />
                {document.metadata.char_count.toLocaleString()} chars
              </div>
            </div>
          </div>
        </div>

        <DocumentActions
          document={document}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDeleteClick}
          isDeleting={isDeleting}
        />
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            {document.metadata.page_count && (
              <span className="text-gray-600">
                {document.metadata.page_count} pages
              </span>
            )}
            <span className="text-gray-600">
              {formatFileSize(document.metadata.file_size)}
            </span>
          </div>
          {getEmbeddingBadge(document.metadata.embedding_source)}
        </div>

        {document.metadata.processing_time_ms && (
          <div className="text-xs text-gray-500">
            Processed in {document.metadata.processing_time_ms}ms
          </div>
        )}

        {/* Content Preview */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm text-gray-700 line-clamp-3">
            {document.content?.substring(0, 200)}
            {document.content?.length > 200 && '...'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex space-x-2">
            <button
              onClick={() => onView(document)}
              className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              View
            </button>
            <button
              onClick={() => onEdit(document)}
              className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Edit
            </button>
          </div>
          
          <div className="text-xs text-gray-400 font-mono">
            ID: {document.id.substring(0, 8)}...
          </div>
        </div>
      </div>
    </Card>
  );
}