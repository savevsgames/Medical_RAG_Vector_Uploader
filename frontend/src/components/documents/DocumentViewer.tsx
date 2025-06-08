import React from 'react';
import { Calendar, FileText, Copy } from 'lucide-react';
import { Button, Badge } from '../ui';
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
  };
  created_at: string;
}

interface DocumentViewerProps {
  document: Document;
}

export function DocumentViewer({ document }: DocumentViewerProps) {
  const handleCopyContent = () => {
    navigator.clipboard.writeText(document.content);
    toast.success('Content copied to clipboard');
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(document.id);
    toast.success('Document ID copied to clipboard');
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center text-sm text-gray-500">
            <Calendar className="w-4 h-4 mr-1" />
            {new Date(document.created_at).toLocaleDateString()}
          </div>
          <div className="flex items-center text-sm text-gray-500">
            <FileText className="w-4 h-4 mr-1" />
            {document.metadata.char_count.toLocaleString()} characters
          </div>
          {getEmbeddingBadge(document.metadata.embedding_source)}
        </div>
      </div>

      {/* Metadata Panel */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">File Size:</span>
            <p className="font-medium">{formatFileSize(document.metadata.file_size)}</p>
          </div>
          {document.metadata.page_count && (
            <div>
              <span className="text-gray-600">Pages:</span>
              <p className="font-medium">{document.metadata.page_count}</p>
            </div>
          )}
          <div>
            <span className="text-gray-600">Type:</span>
            <p className="font-medium">{document.metadata.mime_type || 'Unknown'}</p>
          </div>
          {document.metadata.processing_time_ms && (
            <div>
              <span className="text-gray-600">Processing Time:</span>
              <p className="font-medium">{document.metadata.processing_time_ms}ms</p>
            </div>
          )}
        </div>
        
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-500 font-mono">
            Document ID: {document.id}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyId}
              icon={<Copy className="w-4 h-4" />}
            >
              Copy ID
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyContent}
              icon={<Copy className="w-4 h-4" />}
            >
              Copy Content
            </Button>
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
          {document.content}
        </pre>
      </div>

      {/* Footer Stats */}
      <div className="text-sm text-gray-500 text-center">
        {document.metadata.char_count.toLocaleString()} characters • {' '}
        {Math.ceil(document.content.split(' ').length)} words
      </div>
    </div>
  );
}