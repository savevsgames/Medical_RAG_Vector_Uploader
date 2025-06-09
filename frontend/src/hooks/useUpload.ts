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
    
    // ENHANCED: Log progress updates for debugging
    logger.debug('Upload progress updated', {
      fileIndex,
      updates,
      component: 'useUpload'
    });
  }, []);

  const uploadFile = useCallback(async (file: File, fileIndex: number) => {
    const userEmail = user?.email;
    
    // ENHANCED: Log upload initiation with detailed file info
    logger.debug('Upload file initiated', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      fileIndex,
      lastModified: file.lastModified,
      component: 'useUpload'
    });

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

      // ENHANCED: Log session retrieval attempt
      logger.debug('Retrieving user session for upload', {
        user: userEmail,
        component: 'useUpload'
      });

      // Get session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        logger.error('Session retrieval failed', {
          sessionError: sessionError?.message,
          hasSession: !!session,
          component: 'useUpload'
        });
        throw new Error('Authentication required');
      }

      // ENHANCED: Log session details (safely)
      logger.debug('Session retrieved successfully', {
        hasAccessToken: !!session.access_token,
        tokenPreview: session.access_token ? session.access_token.substring(0, 20) + '...' : 'none',
        expiresAt: session.expires_at,
        component: 'useUpload'
      });

      updateUploadProgress(fileIndex, {
        progress: 30,
        message: 'Uploading file...'
      });

      const formData = new FormData();
      formData.append('file', file);

      // ENHANCED: Log FormData preparation
      logger.debug('FormData prepared', {
        fileName: file.name,
        formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
          key,
          valueType: typeof value,
          valueSize: value instanceof File ? value.size : String(value).length
        })),
        component: 'useUpload'
      });

      const apiUrl = `${import.meta.env.VITE_API_URL}/upload`;
      
      logApiCall('/upload', 'POST', userEmail, 'initiated', {
        fileName: file.name,
        fileSize: file.size,
        apiUrl,
        component: 'useUpload'
      });

      // ENHANCED: Log fetch request details
      logger.debug('Starting fetch request', {
        url: apiUrl,
        method: 'POST',
        hasAuthHeader: !!session.access_token,
        component: 'useUpload'
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      // ENHANCED: Log response details
      logger.debug('Fetch response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        component: 'useUpload'
      });

      updateUploadProgress(fileIndex, {
        progress: 60,
        message: 'Processing document...'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // ENHANCED: Log detailed error response
        logger.error('Upload request failed', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          fileName: file.name,
          component: 'useUpload'
        });
        
        throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
      }

      const responseData = await response.json();

      // ENHANCED: Log successful response data
      logger.debug('Upload response data received', {
        responseData,
        documentId: responseData.document_id,
        contentLength: responseData.content_length,
        vectorDimensions: responseData.vector_dimensions,
        embeddingSource: responseData.embedding_source,
        component: 'useUpload'
      });

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
      
      // ENHANCED: Log detailed error information
      logger.error('Upload file failed', {
        fileName: file.name,
        fileSize: file.size,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        component: 'useUpload'
      });
      
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
    
    // ENHANCED: Log multiple files upload initiation
    logger.debug('Multiple files upload initiated', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      component: 'useUpload'
    });
    
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
        logger.debug('Processing file in sequence', {
          fileIndex: i,
          fileName: files[i].name,
          component: 'useUpload'
        });
        
        const result = await uploadFile(files[i], i);
        results.push(result);
      } catch (error) {
        logger.error('File upload failed in sequence', {
          fileIndex: i,
          fileName: files[i].name,
          user: userEmail,
          error: error instanceof Error ? error.message : 'Unknown error',
          component: 'useUpload'
        });
      }
    }

    setIsUploading(false);
    
    // ENHANCED: Log final upload results
    logger.debug('Multiple files upload completed', {
      totalFiles: files.length,
      successfulUploads: results.length,
      failedUploads: files.length - results.length,
      component: 'useUpload'
    });
    
    return results;
  }, [isUploading, user, uploadFile]);

  const clearUploads = useCallback(() => {
    logger.debug('Clearing upload history', {
      previousUploadCount: uploads.length,
      component: 'useUpload'
    });
    setUploads([]);
  }, [uploads.length]);

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