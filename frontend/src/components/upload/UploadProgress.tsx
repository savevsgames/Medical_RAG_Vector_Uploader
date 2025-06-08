import React from 'react';
import { CheckCircle, AlertCircle, Loader2, FileText } from 'lucide-react';
import { ProgressBar, Badge } from '../ui';

interface UploadItem {
  file: File;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  documentId?: string;
  error?: string;
}

interface UploadProgressProps {
  uploads: UploadItem[];
}

export function UploadProgress({ uploads }: UploadProgressProps) {
  const getStatusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: UploadItem['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Badge variant="info">Processing</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'error':
        return <Badge variant="error">Failed</Badge>;
      default:
        return <Badge variant="default">Pending</Badge>;
    }
  };

  const getProgressColor = (status: UploadItem['status']) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'blue';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Upload Progress</h3>
        <span className="text-sm text-gray-500">
          {uploads.filter(u => u.status === 'completed').length} of {uploads.length} completed
        </span>
      </div>

      {uploads.map((upload, index) => (
        <div key={index} className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            {getStatusIcon(upload.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {upload.file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(upload.file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusBadge(upload.status)}
              <span className="text-sm font-medium text-gray-900">
                {upload.progress}%
              </span>
            </div>
          </div>

          <ProgressBar
            value={upload.progress}
            color={getProgressColor(upload.status)}
            className="mb-2"
          />

          <p className={`text-xs ${
            upload.status === 'error' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {upload.message}
          </p>

          {upload.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {upload.error}
            </div>
          )}

          {upload.status === 'completed' && upload.documentId && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              Document processed successfully! ID: {upload.documentId.substring(0, 8)}...
            </div>
          )}
        </div>
      ))}
    </div>
  );
}