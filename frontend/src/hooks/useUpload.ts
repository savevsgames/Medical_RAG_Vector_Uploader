import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logger, logUserAction, logApiCall, logFileOperation } from '../utils/logger';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

interface UploadProgress {
  file: File;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  documentId?: string;
  error?: string;
}

export function useUpload() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateUploadProgress = useCallback((fileIndex: number, updates: Partial<UploadProgress>) => {
    setUploads(prev => prev.map((upload, index) => 
      index === fileIndex ? { ...upload, ...updates } : upload
    ));
  }, []);

  const uploadFile = useCallback(async (file: File, fileIndex: number) => {
    const userEmail = user?.email;
    
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
        component: 'useUpload'
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
        component: 'useUpload'
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
        component: 'useUpload'
      });

      return responseData;

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
        component: 'useUpload'
      });

      throw error;
    }
  }, [user, updateUploadProgress]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (isUploading) return;

    const userEmail = user?.email;
    
    logUserAction('Multiple Files Upload Initiated', userEmail, {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      component: 'useUpload'
    });

    setIsUploading(true);
    
    // Initialize upload progress for all files
    const initialUploads: UploadProgress[] = files.map(file => ({
      file,
      status: 'uploading' as const,
      progress: 0,
      message: 'Queued for upload...'
    }));
    
    setUploads(initialUploads);

    const results = [];

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await uploadFile(files[i], i);
        results.push(result);
      } catch (error) {
        logger.error('File upload failed', {
          component: 'useUpload',
          user: userEmail,
          fileName: files[i].name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    setIsUploading(false);
    return results;
  }, [isUploading, user, uploadFile]);

  const clearUploads = useCallback(() => {
    setUploads([]);
  }, []);

  const getUploadStats = useCallback(() => {
    const total = uploads.length;
    const completed = uploads.filter(u => u.status === 'completed').length;
    const failed = uploads.filter(u => u.status === 'error').length;
    const inProgress = uploads.filter(u => u.status === 'uploading' || u.status === 'processing').length;

    return { total, completed, failed, inProgress };
  }, [uploads]);

  return {
    uploads,
    isUploading,
    uploadFiles,
    clearUploads,
    getUploadStats
  };
}