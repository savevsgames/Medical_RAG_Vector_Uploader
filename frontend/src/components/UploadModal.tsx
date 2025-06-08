import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { logger, logUserAction, logApiCall, logFileOperation } from '../utils/logger';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface UploadProgress {
  file: File;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  documentId?: string;
  error?: string;
}

export function UploadModal({ isOpen, onClose, onUploadComplete }: UploadModalProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateUploadProgress = (fileIndex: number, updates: Partial<UploadProgress>) => {
    setUploads(prev => prev.map((upload, index) => 
      index === fileIndex ? { ...upload, ...updates } : upload
    ));
  };

  const uploadFile = async (file: File, fileIndex: number) => {
    const userEmail = (await supabase.auth.getUser()).data.user?.email;
    
    try {
      // Update status to uploading
      updateUploadProgress(fileIndex, {
        status: 'uploading',
        progress: 10,
        message: 'Preparing upload...'
      });

      logFileOperation('Upload Started', file.name, userEmail, {
        fileSize: file.size,
        fileType: file.type,
        component: 'UploadModal'
      });

      // Get session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      updateUploadProgress(fileIndex, {
        progress: 30,
        message: 'Uploading file...'
      });

      const formData = new FormData();
      formData.append('file', file);

      const apiUrl = `${import.meta.env.VITE_API_URL}/upload`;
      
      logApiCall('/upload', 'POST', userEmail, 'initiated', {
        fileName: file.name,
        fileSize: file.size,
        component: 'UploadModal'
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      updateUploadProgress(fileIndex, {
        progress: 60,
        message: 'Processing document...'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
      }

      const responseData = await response.json();

      updateUploadProgress(fileIndex, {
        progress: 80,
        message: 'Generating embeddings...'
      });

      // Simulate embedding processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      updateUploadProgress(fileIndex, {
        status: 'completed',
        progress: 100,
        message: 'Upload completed successfully!',
        documentId: responseData.document_id
      });

      logFileOperation('Upload Completed', file.name, userEmail, {
        documentId: responseData.document_id,
        contentLength: responseData.content_length,
        vectorDimensions: responseData.vector_dimensions,
        embeddingSource: responseData.embedding_source,
        component: 'UploadModal'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      
      updateUploadProgress(fileIndex, {
        status: 'error',
        progress: 0,
        message: 'Upload failed',
        error: errorMessage
      });

      logFileOperation('Upload Failed', file.name, userEmail, {
        error: errorMessage,
        component: 'UploadModal'
      });
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (isUploading) return;

    const userEmail = (await supabase.auth.getUser()).data.user?.email;
    
    logUserAction('Multiple Files Upload Initiated', userEmail, {
      fileCount: acceptedFiles.length,
      fileNames: acceptedFiles.map(f => f.name),
      component: 'UploadModal'
    });

    setIsUploading(true);
    
    // Initialize upload progress for all files
    const initialUploads: UploadProgress[] = acceptedFiles.map(file => ({
      file,
      status: 'uploading' as const,
      progress: 0,
      message: 'Queued for upload...'
    }));
    
    setUploads(initialUploads);

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < acceptedFiles.length; i++) {
      await uploadFile(acceptedFiles[i], i);
    }

    setIsUploading(false);
    
    // Auto-close modal after successful uploads (with delay)
    const allSuccessful = uploads.every(upload => upload.status === 'completed');
    if (allSuccessful) {
      setTimeout(() => {
        onUploadComplete();
        handleClose();
      }, 2000);
    }
  }, [isUploading, uploads]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    multiple: true,
    disabled: isUploading,
    onDropRejected: (fileRejections) => {
      logger.warn('Files upload rejected', {
        component: 'UploadModal',
        rejections: fileRejections.map(rejection => ({
          fileName: rejection.file.name,
          errors: rejection.errors.map(e => e.message)
        }))
      });
      toast.error('Some files were rejected. Please check file types and sizes.');
    }
  });

  const handleClose = () => {
    if (isUploading) {
      toast.error('Cannot close while uploads are in progress');
      return;
    }
    setUploads([]);
    onClose();
  };

  const getStatusIcon = (status: UploadProgress['status']) => {
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

  const getStatusColor = (status: UploadProgress['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
              <Upload className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Upload Documents</h2>
              <p className="text-sm text-gray-500">Add medical documents for AI analysis</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Drop Zone */}
          {uploads.length === 0 && (
            <div
              {...getRootProps()}
              className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {isDragActive ? (
                <p className="text-blue-500 font-medium">Drop the files here</p>
              ) : (
                <div>
                  <p className="text-gray-600 font-medium">Drag & drop files here, or click to select</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Supported formats: PDF, DOCX, TXT, MD • Multiple files allowed
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Upload Progress */}
          {uploads.length > 0 && (
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
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {upload.progress}%
                      </p>
                      <p className={`text-xs ${
                        upload.status === 'error' ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {upload.message}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getStatusColor(upload.status)}`}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>

                  {/* Error Message */}
                  {upload.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      {upload.error}
                    </div>
                  )}

                  {/* Success Details */}
                  {upload.status === 'completed' && upload.documentId && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                      Document processed successfully! ID: {upload.documentId.substring(0, 8)}...
                    </div>
                  )}
                </div>
              ))}

              {/* Add More Files Button */}
              {!isUploading && (
                <div
                  {...getRootProps()}
                  className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-gray-400 transition-colors"
                >
                  <input {...getInputProps()} />
                  <p className="text-sm text-gray-600">
                    <Upload className="w-4 h-4 inline mr-2" />
                    Add more files
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {uploads.length > 0 && (
              <span>
                {uploads.filter(u => u.status === 'completed').length} completed, {' '}
                {uploads.filter(u => u.status === 'error').length} failed
              </span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Close'}
            </button>
            {uploads.length > 0 && uploads.every(u => u.status === 'completed') && (
              <button
                onClick={() => {
                  onUploadComplete();
                  handleClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}