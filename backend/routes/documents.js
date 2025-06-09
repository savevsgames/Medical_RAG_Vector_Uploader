import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database.js';
import { DocumentProcessingService, EmbeddingService } from '../lib/services/index.js';
import { upload } from '../middleware/upload.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

const router = express.Router();

// Initialize services
const documentProcessor = new DocumentProcessingService();
const embeddingService = new EmbeddingService();

// Enhanced document upload endpoint with comprehensive logging
router.post('/upload', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      errorLogger.warn('Upload failed - no file provided', { 
        user_id: req.userId,
        ip: req.ip,
        component: 'DocumentUpload'
      });
      return res.status(400).json({ error: 'No file provided' });
    }

    errorLogger.info('Processing upload', {
      user_id: req.userId,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ip: req.ip,
      component: 'DocumentUpload'
    });

    const documentId = uuidv4();
    
    // ENHANCED: Log before text extraction
    errorLogger.debug('Starting text extraction', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname,
      buffer_size: req.file.buffer.length,
      component: 'DocumentUpload'
    });

    // Extract text from document
    const { text, metadata } = await documentProcessor.extractText(
      req.file.buffer, 
      req.file.originalname
    );

    // ENHANCED: Log after text extraction
    errorLogger.debug('Text extraction completed', {
      user_id: req.userId,
      document_id: documentId,
      text_length: text?.length || 0,
      metadata,
      component: 'DocumentUpload'
    });

    if (!text || text.trim().length === 0) {
      errorLogger.warn('Upload failed - no text extracted', {
        user_id: req.userId,
        filename: req.file.originalname,
        metadata,
        component: 'DocumentUpload'
      });
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    // ENHANCED: Log embedding attempt details
    let embedding;
    let embeddingSource = 'local';
    
    try {
      if (process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.debug('Attempting TxAgent embedding', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL,
          has_jwt: !!req.headers.authorization,
          jwt_preview: req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'none',
          component: 'DocumentUpload'
        });

        // CRITICAL FIX: Pass user JWT to embedding service
        embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
        embeddingSource = 'runpod';
        
        errorLogger.success('TxAgent embedding completed', {
          user_id: req.userId,
          document_id: documentId,
          dimensions: embedding?.length || 0,
          embedding_type: typeof embedding,
          component: 'DocumentUpload'
        });
      } else {
        throw new Error('TxAgent not configured - RUNPOD_EMBEDDING_URL missing');
      }
    } catch (embeddingError) {
      errorLogger.warn('TxAgent embedding failed, attempting local service', {
        user_id: req.userId,
        document_id: documentId,
        error: embeddingError.message,
        error_code: embeddingError.code,
        error_name: embeddingError.name,
        status: embeddingError.response?.status,
        response_data: embeddingError.response?.data,
        component: 'DocumentUpload'
      });
      
      try {
        // ENHANCED: Log local embedding attempt
        errorLogger.debug('Attempting local embedding fallback', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          has_jwt: !!req.headers.authorization,
          component: 'DocumentUpload'
        });

        // CRITICAL FIX: Pass user JWT to local embedding service
        embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
        embeddingSource = 'local';
        
        errorLogger.info('Local embedding completed', {
          user_id: req.userId,
          document_id: documentId,
          dimensions: embedding?.length || 0,
          embedding_type: typeof embedding,
          component: 'DocumentUpload'
        });
      } catch (localEmbeddingError) {
        errorLogger.error('Both TxAgent and local embedding failed', localEmbeddingError, {
          user_id: req.userId,
          document_id: documentId,
          txagent_error: embeddingError.message,
          local_error: localEmbeddingError.message,
          component: 'DocumentUpload'
        });
        throw localEmbeddingError;
      }
    }

    // ENHANCED: Validate embedding before database insertion
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      errorLogger.error('Invalid embedding generated', new Error('Embedding validation failed'), {
        user_id: req.userId,
        document_id: documentId,
        embedding_type: typeof embedding,
        embedding_length: embedding?.length || 0,
        embedding_source: embeddingSource,
        component: 'DocumentUpload'
      });
      throw new Error('Failed to generate valid embedding');
    }

    // CRITICAL FIX: Ensure user_id is properly set for RLS
    const documentData = {
      id: documentId,
      filename: req.file.originalname,
      content: text,
      metadata: {
        ...metadata,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        embedding_source: embeddingSource,
        processing_time_ms: Date.now() - startTime
      },
      embedding,
      user_id: req.userId // CRITICAL: This must match the authenticated user's ID
    };

    errorLogger.debug('Preparing Supabase insertion', {
      user_id: req.userId,
      document_id: documentId,
      has_embedding: !!embedding,
      embedding_dimensions: embedding?.length,
      document_data_keys: Object.keys(documentData),
      component: 'DocumentUpload'
    });

    // Store in Supabase with proper user context
    const { data, error } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    // ENHANCED: Detailed Supabase error logging
    if (error) {
      errorLogger.error('Supabase insert failed', error, {
        user_id: req.userId,
        document_id: documentId,
        filename: req.file.originalname,
        error_code: error.code,
        error_details: error.details,
        error_hint: error.hint,
        error_message: error.message,
        supabase_operation: 'insert',
        table: 'documents',
        document_data_size: JSON.stringify(documentData).length,
        component: 'DocumentUpload'
      });
      
      // Provide more specific error messages for common RLS issues
      if (error.code === '42501') {
        return res.status(403).json({ 
          error: 'Access denied: Unable to save document. Please ensure you are properly authenticated.',
          details: 'Row Level Security policy violation - user authentication may have expired'
        });
      }
      
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Document with this ID already exists',
          details: 'Duplicate document ID conflict'
        });
      }
      
      throw error;
    }

    const processingTime = Date.now() - startTime;

    errorLogger.success('Document processed successfully', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname,
      content_length: text.length,
      vector_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      processing_time_ms: processingTime,
      supabase_id: data.id,
      component: 'DocumentUpload'
    });

    res.json({
      document_id: documentId,
      filename: req.file.originalname,
      content_length: text.length,
      vector_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      processing_time_ms: processingTime,
      message: 'Document uploaded and processed successfully'
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    errorLogger.error('Upload processing failed', error, {
      user_id: req.userId,
      filename: req.file?.originalname,
      processing_time_ms: processingTime,
      error_stack: error.stack,
      error_type: error.constructor.name,
      supabase_error_details: error.details || null,
      component: 'DocumentUpload'
    });
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

export { router as documentsRouter };