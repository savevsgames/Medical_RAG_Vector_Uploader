import React from 'react';
import { CheckCircle, XCircle, Loader2, FileText, Clock, Zap, Database, AlertCircle } from 'lucide-react';

interface UploadProgressItem {
  file: File;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  documentId?: string;
  error?: string;
}

interface UploadProgressProps {
  uploads: UploadProgressItem[];
}

export function UploadProgress({ uploads }: UploadProgressProps) {
  const getStatusIcon = (status: string, progress: number) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-healing-teal" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-5 h-5 text-guardian-gold animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-soft-gray" />;
    }
  };

  const getStageIcon = (message: string) => {
    if (message.includes('Preparing') || message.includes('upload')) {
      return <FileText className="w-4 h-4 text-guardian-gold" />;
    } else if (message.includes('Processing') || message.includes('document')) {
      return <Zap className="w-4 h-4 text-guardian-gold" />;
    } else if (message.includes('embedding') || message.includes('Generating')) {
      return <Database className="w-4 h-4 text-guardian-gold" />;
    } else if (message.includes('completed') || message.includes('success')) {
      return <CheckCircle className="w-4 h-4 text-healing-teal" />;
    } else if (message.includes('failed') || message.includes('error')) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    return <Clock className="w-4 h-4 text-soft-gray" />;
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-healing-teal';
      case 'error':
        return 'bg-red-500';
      case 'uploading':
      case 'processing':
        return 'bg-guardian-gold';
      default:
        return 'bg-soft-gray';
    }
  };

  const getBackgroundColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-healing-teal/5 border-healing-teal/20';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'uploading':
      case 'processing':
        return 'bg-guardian-gold/5 border-guardian-gold/20';
      default:
        return 'bg-sky-blue/10 border-soft-gray/20';
    }
  };

  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {uploads.map((upload, index) => (
        <div
          key={index}
          className={`border rounded-xl p-4 transition-all duration-200 ${getBackgroundColor(upload.status)}`}
        >
          {/* File Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {getStatusIcon(upload.status, upload.progress)}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-subheading font-medium text-deep-midnight truncate">
                  {upload.file.name}
                </h4>
                <p className="text-xs text-soft-gray font-body">
                  {(upload.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <div className={`text-sm font-subheading font-medium ${
                upload.status === 'completed' ? 'text-healing-teal' :
                upload.status === 'error' ? 'text-red-600' :
                'text-guardian-gold'
              }`}>
                {upload.progress}%
              </div>
              {upload.documentId && (
                <div className="text-xs text-soft-gray font-mono">
                  ID: {upload.documentId.substring(0, 8)}...
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="w-full bg-soft-gray/20 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(upload.status)}`}
                style={{ width: `${upload.progress}%` }}
              />
            </div>
          </div>

          {/* Status Message */}
          <div className="flex items-center space-x-2">
            {getStageIcon(upload.message)}
            <span className="text-sm font-body text-deep-midnight">
              {upload.message}
            </span>
          </div>

          {/* Error Details */}
          {upload.status === 'error' && upload.error && (
            <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-subheading font-medium text-red-800">Upload Failed</p>
                  <p className="text-xs text-red-600 font-body mt-1">{upload.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Details */}
          {upload.status === 'completed' && upload.documentId && (
            <div className="mt-3 p-3 bg-healing-teal/10 border border-healing-teal/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-healing-teal mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-subheading font-medium text-healing-teal">Upload Successful</p>
                  <p className="text-xs text-healing-teal/80 font-body mt-1">
                    Document processed and ready for AI analysis
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Processing Stages Indicator */}
          {(upload.status === 'uploading' || upload.status === 'processing') && (
            <div className="mt-3 p-3 bg-guardian-gold/10 border border-guardian-gold/20 rounded-lg">
              <div className="flex items-center space-x-4 text-xs font-body">
                <div className={`flex items-center space-x-1 ${
                  upload.progress >= 10 ? 'text-healing-teal' : 'text-soft-gray'
                }`}>
                  {upload.progress >= 10 ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 border border-soft-gray rounded-full" />}
                  <span>Prepare</span>
                </div>
                <div className={`flex items-center space-x-1 ${
                  upload.progress >= 30 ? 'text-healing-teal' : upload.progress >= 10 ? 'text-guardian-gold' : 'text-soft-gray'
                }`}>
                  {upload.progress >= 30 ? <CheckCircle className="w-3 h-3" /> : 
                   upload.progress >= 10 ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                   <div className="w-3 h-3 border border-soft-gray rounded-full" />}
                  <span>Upload</span>
                </div>
                <div className={`flex items-center space-x-1 ${
                  upload.progress >= 60 ? 'text-healing-teal' : upload.progress >= 30 ? 'text-guardian-gold' : 'text-soft-gray'
                }`}>
                  {upload.progress >= 60 ? <CheckCircle className="w-3 h-3" /> : 
                   upload.progress >= 30 ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                   <div className="w-3 h-3 border border-soft-gray rounded-full" />}
                  <span>Process</span>
                </div>
                <div className={`flex items-center space-x-1 ${
                  upload.progress >= 80 ? 'text-healing-teal' : upload.progress >= 60 ? 'text-guardian-gold' : 'text-soft-gray'
                }`}>
                  {upload.progress >= 80 ? <CheckCircle className="w-3 h-3" /> : 
                   upload.progress >= 60 ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                   <div className="w-3 h-3 border border-soft-gray rounded-full" />}
                  <span>Embed</span>
                </div>
                <div className={`flex items-center space-x-1 ${
                  upload.progress >= 100 ? 'text-healing-teal' : upload.progress >= 80 ? 'text-guardian-gold' : 'text-soft-gray'
                }`}>
                  {upload.progress >= 100 ? <CheckCircle className="w-3 h-3" /> : 
                   upload.progress >= 80 ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                   <div className="w-3 h-3 border border-soft-gray rounded-full" />}
                  <span>Complete</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}