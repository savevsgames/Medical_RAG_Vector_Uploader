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

    // ENHANCED: Log detailed file information
    logger.debug('File upload initiated with detailed info', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      lastModified: file.lastModified,
      webkitRelativePath: file.webkitRelativePath || 'none',
      component: 'FileUpload'
    });

    logFileOperation('Upload Started', file.name, null, {
      fileSize: file.size,
      fileType: file.type,
      component: 'FileUpload'
    });

    // ENHANCED: Log session retrieval attempt with detailed debugging
    logger.debug('Attempting to retrieve user session for upload', { 
      component: 'FileUpload',
      timestamp: new Date().toISOString()
    });

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // ENHANCED: Log session retrieval results
    if (sessionError) {
      logger.error('Session retrieval failed', {
        sessionError: sessionError.message,
        sessionErrorCode: sessionError.status,
        sessionErrorDetails: sessionError,
        component: 'FileUpload'
      });
      logSupabaseOperation('getSession', null, 'error', {
        error: sessionError.message,
        component: 'FileUpload'
      });
      toast.error('Session error: Please login again');
      return;
    }

    if (!session) {
      logger.warn('No session found for upload', {
        sessionExists: !!session,
        component: 'FileUpload'
      });
      logUserAction('Upload Blocked - No Session', null, {
        component: 'FileUpload',
        fileName: file.name
      });
      toast.error('Please login to upload files');
      return;
    }

    // ENHANCED: Log session details (safely)
    const userEmail = session.user?.email;
    logger.debug('Session retrieved successfully for upload', {
      hasSession: !!session,
      hasUser: !!session.user,
      userEmail: userEmail,
      hasAccessToken: !!session.access_token,
      tokenPreview: session.access_token ? session.access_token.substring(0, 20) + '...' : 'none',
      tokenLength: session.access_token?.length || 0,
      expiresAt: session.expires_at,
      component: 'FileUpload'
    });

    logUserAction('File Upload Initiated', userEmail, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      component: 'FileUpload'
    });

    // ENHANCED: Log FormData preparation
    logger.debug('Preparing FormData for upload', {
      fileName: file.name,
      fileSize: file.size,
      component: 'FileUpload'
    });

    const formData = new FormData();
    formData.append('file', file);

    // ENHANCED: Log FormData details
    logger.debug('FormData prepared successfully', {
      fileName: file.name,
      formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
        key,
        valueType: typeof value,
        valueName: value instanceof File ? value.name : String(value),
        valueSize: value instanceof File ? value.size : String(value).length
      })),
      component: 'FileUpload'
    });

    try {
      const apiUrl = `${import.meta.env.VITE_API_URL}/upload`;
      
      // ENHANCED: Log API call preparation
      logger.debug('Preparing API call for upload', {
        apiUrl,
        method: 'POST',
        fileName: file.name,
        hasAuthToken: !!session.access_token,
        authTokenPreview: session.access_token ? session.access_token.substring(0, 20) + '...' : 'none',
        component: 'FileUpload'
      });
      
      logApiCall('/upload', 'POST', userEmail, 'initiated', {
        fileName: file.name,
        fileSize: file.size,
        apiUrl,
        component: 'FileUpload'
      });

      // ENHANCED: Log fetch request initiation
      logger.debug('Starting fetch request to backend', {
        url: apiUrl,
        method: 'POST',
        hasFormData: !!formData,
        hasAuthHeader: !!session.access_token,
        component: 'FileUpload'
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      // ENHANCED: Log detailed response information
      logger.debug('Fetch response received from backend', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url,
        type: response.type,
        redirected: response.redirected,
        headers: Object.fromEntries(response.headers.entries()),
        component: 'FileUpload'
      });

      if (!response.ok) {
        let errorData;
        const contentType = response.headers.get('content-type');
        
        // ENHANCED: Log content type and response parsing attempt
        logger.debug('Response not OK, attempting to parse error', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          component: 'FileUpload'
        });

        try {
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
            logger.debug('Error response parsed as JSON', {
              errorData,
              component: 'FileUpload'
            });
          } else {
            const textResponse = await response.text();
            logger.debug('Error response parsed as text', {
              textResponse: textResponse.substring(0, 500) + (textResponse.length > 500 ? '...' : ''),
              textLength: textResponse.length,
              component: 'FileUpload'
            });
            errorData = { error: `Server returned non-JSON response: ${response.status}` };
          }
        } catch (parseError) {
          logger.error('Failed to parse error response', {
            parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
            component: 'FileUpload'
          });
          errorData = { error: `Failed to parse server response: ${response.status}` };
        }
        
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

      // ENHANCED: Log successful response parsing
      logger.debug('Attempting to parse successful response', {
        status: response.status,
        component: 'FileUpload'
      });

      const responseData = await response.json();
      
      // ENHANCED: Log response data details
      logger.debug('Response data parsed successfully', {
        responseData,
        responseKeys: Object.keys(responseData),
        hasMessage: !!responseData.message,
        hasFilename: !!responseData.filename,
        hasChunks: !!responseData.chunks,
        component: 'FileUpload'
      });
      
      logApiCall('/upload', 'POST', userEmail, 'success', {
        status: response.status,
        responseData,
        fileName: file.name,
        component: 'FileUpload'
      });

      logFileOperation('Upload Completed Successfully', file.name, userEmail, {
        totalChunks: responseData.total_chunks,
        successfulChunks: responseData.successful_chunks,
        failedChunks: responseData.failed_chunks,
        processingTimeMs: responseData.processing_time_ms,
        component: 'FileUpload'
      });

      // ENHANCED: Show appropriate success message
      if (responseData.successful_chunks > 0) {
        toast.success(`Document processed successfully! ${responseData.successful_chunks} chunks created.`);
        
        if (responseData.failed_chunks > 0) {
          setTimeout(() => {
            toast(`⚠️ ${responseData.failed_chunks} chunks failed to process. Check the document for issues.`, {
              duration: 5000,
              icon: '⚠️'
            });
          }, 1000);
        }
      } else {
        toast.error('Document upload failed - no chunks were processed successfully.');
      }

      // ENHANCED: Add informational toast about processing
      setTimeout(() => {
        toast('📄 Document is now available for AI analysis in the chat interface.', {
          duration: 4000,
          icon: '✅'
        });
      }, 2000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      
      // ENHANCED: Log detailed error information
      logger.error('Upload process failed with detailed error info', {
        fileName: file.name,
        fileSize: file.size,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        apiUrl: `${import.meta.env.VITE_API_URL}/upload`,
        component: 'FileUpload'
      });
      
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
      logger.warn('File upload rejected with detailed info', {
        component: 'FileUpload',
        rejections: fileRejections.map(rejection => ({
          fileName: rejection.file.name,
          fileSize: rejection.file.size,
          fileType: rejection.file.type,
          errors: rejection.errors.map(e => ({
            code: e.code,
            message: e.message
          }))
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
            📋 Note: Documents are processed with BioBERT embeddings for medical AI analysis
          </p>
        </div>
      )}
    </div>
  );
}