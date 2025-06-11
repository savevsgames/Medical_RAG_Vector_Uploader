import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { logger, logUserAction, logApiCall, logFileOperation, logSupabaseOperation } from '../utils/logger';

export function FileUpload() {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) {
      logger.warn('No file provided to upload', { component: 'FileUpload' });
      return;
    }

    logFileOperation('Upload Started', file.name, null, {
      fileSize: file.size,
      fileType: file.type,
      component: 'FileUpload'
    });

    // Get the current session
    logger.debug('Checking user session for upload', { component: 'FileUpload' });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      logSupabaseOperation('getSession', null, 'error', {
        error: sessionError.message,
        component: 'FileUpload'
      });
      toast.error('Session error: Please login again');
      return;
    }

    if (!session) {
      logUserAction('Upload Blocked - No Session', null, {
        component: 'FileUpload',
        fileName: file.name
      });
      toast.error('Please login to upload files');
      return;
    }

    const userEmail = session.user?.email;
    logUserAction('File Upload Initiated', userEmail, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      component: 'FileUpload'
    });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiUrl = `${import.meta.env.VITE_API_URL}/upload`;
      
      logApiCall('/upload', 'POST', userEmail, 'initiated', {
        fileName: file.name,
        fileSize: file.size,
        component: 'FileUpload'
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        logApiCall('/upload', 'POST', userEmail, 'error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          fileName: file.name,
          component: 'FileUpload'
        });

        // Enhanced error handling for different scenarios
        if (response.status === 503) {
          throw new Error(errorData.error || 'TxAgent is not running. Please start the agent from the Monitor page before uploading documents.');
        } else if (response.status === 422) {
          throw new Error(errorData.details || 'Document format not supported or TxAgent container needs updating.');
        } else {
          throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const responseData = await response.json();
      
      logApiCall('/upload', 'POST', userEmail, 'success', {
        status: response.status,
        responseData,
        fileName: file.name,
        component: 'FileUpload'
      });

      logFileOperation('Upload Submitted', file.name, userEmail, {
        jobId: responseData.job_id,
        status: responseData.status,
        processingMessage: responseData.processing_message,
        component: 'FileUpload'
      });

      // UPDATED: Show appropriate message for asynchronous processing
      toast.success('Document submitted for processing! It will appear in your library once processing is complete.');
      
      // UPDATED: Add informational toast about processing time
      setTimeout(() => {
        toast('📄 Processing may take a few minutes depending on document size and complexity.', {
          duration: 5000,
          icon: '⏳'
        });
      }, 1000);

      // REMOVED: No longer automatically refresh the page since processing is asynchronous
      // Documents will appear in the library once TxAgent completes processing

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      
      logFileOperation('Upload Failed', file.name, userEmail, {
        error: errorMessage,
        component: 'FileUpload'
      });

      toast.error(errorMessage);
      console.error('Upload error:', error);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxFiles: 1,
    onDropRejected: (fileRejections) => {
      logger.warn('File upload rejected', {
        component: 'FileUpload',
        rejections: fileRejections.map(rejection => ({
          fileName: rejection.file.name,
          errors: rejection.errors.map(e => e.message)
        }))
      });
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
    >
      <input {...getInputProps()} />
      <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
      {isDragActive ? (
        <p className="text-blue-500">Drop the file here</p>
      ) : (
        <div>
          <p className="text-gray-600">Drag & drop a file here, or click to select</p>
          <p className="text-sm text-gray-500 mt-2">Supported formats: PDF, DOCX, TXT, MD</p>
          <p className="text-xs text-gray-400 mt-2">
            📋 Note: Documents are processed by TxAgent and may take a few minutes to appear in your library
          </p>
        </div>
      )}
    </div>
  );
}