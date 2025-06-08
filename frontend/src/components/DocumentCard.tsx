import React, { useState } from 'react';
import { FileText, Download, Trash2, Edit3, Calendar, User, MoreVertical, Eye, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { logger, logUserAction } from '../utils/logger';

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
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${document.filename}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(document.id);
      logUserAction('Document Deleted', null, {
        documentId: document.id,
        filename: document.filename,
        component: 'DocumentCard'
      });
      toast.success('Document deleted successfully');
    } catch (error) {
      logger.error('Failed to delete document', {
        component: 'DocumentCard',
        documentId: document.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(document.id);
    toast.success('Document ID copied to clipboard');
    setShowMenu(false);
  };

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
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">BioBERT</span>;
      case 'openai':
      case 'local':
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">OpenAI</span>;
      case 'local_with_runpod_processing':
        return <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Hybrid</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">Unknown</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-6 relative">
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

        {/* Menu Button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isDeleting}
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  onView(document);
                  setShowMenu(false);
                }}
                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Content
              </button>
              <button
                onClick={() => {
                  onEdit(document);
                  setShowMenu(false);
                }}
                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Metadata
              </button>
              <button
                onClick={handleCopyId}
                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy ID
              </button>
              <div className="border-t border-gray-100"></div>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        {/* Stats Row */}
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

        {/* Processing Info */}
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

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex space-x-2">
            <button
              onClick={() => onView(document)}
              className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4 mr-1" />
              View
            </button>
            <button
              onClick={() => onEdit(document)}
              className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <Edit3 className="w-4 h-4 mr-1" />
              Edit
            </button>
          </div>
          
          <div className="text-xs text-gray-400 font-mono">
            ID: {document.id.substring(0, 8)}...
          </div>
        </div>
      </div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}