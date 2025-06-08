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
    
    // Extract text from document
    const { text, metadata } = await documentProcessor.extractText(
      req.file.buffer, 
      req.file.originalname
    );

    if (!text || text.trim().length === 0) {
      errorLogger.warn('Upload failed - no text extracted', {
        user_id: req.userId,
        filename: req.file.originalname,
        metadata,
        component: 'DocumentUpload'
      });
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    // CRITICAL FIX: Try TxAgent embedding first with proper JWT forwarding
    let embedding;
    let embeddingSource = 'local';
    
    try {
      if (process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.info('Attempting TxAgent embedding with user JWT', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL,
          has_jwt: !!req.headers.authorization,
          component: 'DocumentUpload'
        });

        // CRITICAL FIX: Pass user JWT to embedding service
        embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
        embeddingSource = 'runpod';
        
        errorLogger.success('TxAgent embedding completed', {
          user_id: req.userId,
          document_id: documentId,
          dimensions: embedding.length,
          component: 'DocumentUpload'
        });
      } else {
        throw new Error('TxAgent not configured');
      }
    } catch (embeddingError) {
      errorLogger.warn('TxAgent embedding failed, using local service', {
        user_id: req.userId,
        document_id: documentId,
        error: embeddingError.message,
        error_code: embeddingError.code,
        status: embeddingError.response?.status,
        component: 'DocumentUpload'
      });
      
      // CRITICAL FIX: Pass user JWT to local embedding service
      embedding = await embeddingService.generateEmbedding(text, req.headers.authorization);
      embeddingSource = 'local';
      
      errorLogger.info('Local embedding completed', {
        user_id: req.userId,
        document_id: documentId,
        dimensions: embedding?.length,
        component: 'DocumentUpload'
      });
    }

    // Store in Supabase
    const { data, error } = await supabase
      .from('documents')
      .insert({
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
        user_id: req.userId
      })
      .select()
      .single();

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
        component: 'DocumentUpload'
      });
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