import React from 'react';
import { X, FileText, Calendar, User, Download, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

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
    title?: string;
    chunk_index?: number;
    total_chunks?: number;
    [key: string]: any;
  };
  created_at: string;
}

interface DocumentViewModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

// Helper function to create a user-friendly display name
const getDocumentDisplayName = (document: Document): string => {
  const { metadata, filename } = document;
  
  // Extract title from metadata, fallback to filename
  const baseTitle = metadata.title || filename || 'Untitled Document';
  
  // If we have chunk information, add it to the display name
  if (metadata.chunk_index !== undefined && metadata.total_chunks !== undefined) {
    // Convert 0-based index to 1-based for user display
    const chunkNumber = metadata.chunk_index + 1;
    return `${baseTitle} (Chunk ${chunkNumber}/${metadata.total_chunks})`;
  }
  
  return baseTitle;
};

export function DocumentViewModal({ document, isOpen, onClose }: DocumentViewModalProps) {
  if (!isOpen || !document) return null;

  const handleCopyContent = () => {
    navigator.clipboard.writeText(document.content);
    toast.success('Content copied to clipboard');
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(document.id);
    toast.success('Document ID copied to clipboard');
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
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

  // Get the display name for this document
  const displayName = getDocumentDisplayName(document);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-gray-900 truncate" title={displayName}>
                {displayName}
              </h2>
              <div className="flex items-center space-x-4 mt-1">
                <div className="flex items-center text-sm text-gray-500">
                  <Calendar className="w-4 h-4 mr-1" />
                  {new Date(document.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <FileText className="w-4 h-4 mr-1" />
                  {(document.metadata.char_count || 0).toLocaleString()} characters
                </div>
                {getEmbeddingBadge(document.metadata.embedding_source)}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col h-[calc(90vh-140px)]">
          {/* Metadata Panel */}
          <div className="bg-gray-50 p-4 border-b border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">File Size:</span>
                <p className="font-medium">{formatFileSize(document.metadata.file_size)}</p>
              </div>
              {document.metadata.page_count && (
                <div>
                  <span className="text-gray-500">Pages:</span>
                  <p className="font-medium">{document.metadata.page_count}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Type:</span>
                <p className="font-medium">{document.metadata.mime_type || 'Unknown'}</p>
              </div>
              {document.metadata.processing_time_ms && (
                <div>
                  <span className="text-gray-500">Processing Time:</span>
                  <p className="font-medium">{document.metadata.processing_time_ms}ms</p>
                </div>
              )}
            </div>
            
            {/* Chunk Information */}
            {document.metadata.chunk_index !== undefined && document.metadata.total_chunks !== undefined && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-blue-800 font-medium">Document Chunk Information</span>
                    <p className="text-blue-600 text-sm">
                      This is chunk {document.metadata.chunk_index + 1} of {document.metadata.total_chunks} from the original document
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {document.metadata.chunk_index + 1}/{document.metadata.total_chunks}
                  </span>
                </div>
              </div>
            )}
            
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-gray-500 font-mono">
                Document ID: {document.id}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleCopyId}
                  className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy ID
                </button>
                <button
                  onClick={handleCopyContent}
                  className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy Content
                </button>
              </div>
            </div>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="prose max-w-none">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                  {document.content}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {(document.metadata.char_count || 0).toLocaleString()} characters • {' '}
            {Math.ceil((document.content || '').split(' ').length)} words
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}