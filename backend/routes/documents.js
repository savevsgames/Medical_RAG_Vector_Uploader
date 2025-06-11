import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DocumentProcessingService, EmbeddingService } from '../lib/services/index.js';
import { upload } from '../middleware/upload.js';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

export function createDocumentsRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to createDocumentsRouter');
  }

  const router = express.Router();

  // Apply authentication to all document routes
  router.use(verifyToken);

  // Initialize services with injected Supabase client
  const documentProcessor = new DocumentProcessingService();
  const embeddingService = new EmbeddingService();

  // CRITICAL: Expected embedding dimensions for the database schema
  const EXPECTED_EMBEDDING_DIMENSIONS = 768;

  // Text sanitization function to prevent Unicode escape sequence errors
  const sanitizeTextForDatabase = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    return text
      // Replace single backslashes with double backslashes to prevent escape sequence interpretation
      .replace(/\\/g, '\\\\')
      // Remove or replace other problematic Unicode sequences
      .replace(/\u0000/g, '') // Remove null bytes
      // Replace invalid Unicode surrogates
      .replace(/[\uD800-\uDFFF]/g, '?')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  };

  // Validate embedding dimensions
  const validateEmbeddingDimensions = (embedding, embeddingSource) => {
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding: not an array');
    }

    if (embedding.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
      const errorMessage = `Embedding dimension mismatch: expected ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length} from ${embeddingSource}`;
      
      if (embeddingSource === 'openai') {
        throw new Error(
          `${errorMessage}. OpenAI embeddings (${embedding.length}D) are incompatible with this system. ` +
          `Please ensure TxAgent is configured and running to generate compatible ${EXPECTED_EMBEDDING_DIMENSIONS}D embeddings.`
        );
      } else {
        throw new Error(errorMessage);
      }
    }

    return true;
  };

  // Enhanced document upload endpoint with comprehensive logging
  router.post('/upload', upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    
    // ENHANCED: Log request arrival at the very beginning
    errorLogger.info('📥 UPLOAD REQUEST RECEIVED', {
      user_id: req.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      hasFile: !!req.file,
      component: 'DocumentUpload',
      timestamp: new Date().toISOString()
    });

    try {
      if (!req.file) {
        errorLogger.warn('Upload failed - no file provided', { 
          user_id: req.userId,
          ip: req.ip,
          headers: req.headers,
          body: req.body,
          component: 'DocumentUpload'
        });
        return res.status(400).json({ error: 'No file provided' });
      }

      // ENHANCED: Log detailed file information
      errorLogger.info('📄 FILE DETAILS RECEIVED', {
        user_id: req.userId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        encoding: req.file.encoding,
        fieldname: req.file.fieldname,
        bufferLength: req.file.buffer?.length || 0,
        ip: req.ip,
        component: 'DocumentUpload'
      });

      errorLogger.info('Processing upload with chunking', {
        user_id: req.userId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        ip: req.ip,
        component: 'DocumentUpload'
      });

      // ENHANCED: Log text extraction attempt
      errorLogger.debug('🔍 STARTING TEXT EXTRACTION', {
        user_id: req.userId,
        filename: req.file.originalname,
        bufferSize: req.file.buffer.length,
        mimetype: req.file.mimetype,
        component: 'DocumentUpload'
      });

      // Extract text and create chunks
      const { chunks, originalMetadata } = await documentProcessor.extractText(
        req.file.buffer, 
        req.file.originalname
      );

      // ENHANCED: Log text extraction results
      errorLogger.info('📝 TEXT EXTRACTION COMPLETED', {
        user_id: req.userId,
        filename: req.file.originalname,
        chunksCreated: chunks?.length || 0,
        originalLength: originalMetadata?.original_length || 0,
        extractionSuccessful: !!(chunks && chunks.length > 0),
        originalMetadata,
        component: 'DocumentUpload'
      });

      if (!chunks || chunks.length === 0) {
        errorLogger.warn('Upload failed - no chunks created', {
          user_id: req.userId,
          filename: req.file.originalname,
          originalMetadata,
          extractedText: originalMetadata?.extracted_text?.substring(0, 200) || 'none',
          component: 'DocumentUpload'
        });
        return res.status(400).json({ error: 'Could not extract text from document' });
      }

      // Update chunk metadata with total count
      chunks.forEach(chunk => {
        chunk.metadata.chunk_count = chunks.length;
      });

      errorLogger.info('Document chunked successfully', {
        user_id: req.userId,
        filename: req.file.originalname,
        chunks_created: chunks.length,
        total_characters: originalMetadata.original_length,
        component: 'DocumentUpload'
      });

      // Process each chunk
      const processedChunks = [];
      const failedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = uuidv4();

        try {
          // ENHANCED: Log chunk processing start
          errorLogger.debug(`🔄 PROCESSING CHUNK ${i + 1}/${chunks.length}`, {
            user_id: req.userId,
            chunk_id: chunkId,
            chunk_index: i,
            chunk_length: chunk.content.length,
            chunk_preview: chunk.content.substring(0, 100) + '...',
            component: 'DocumentUpload'
          });

          // CRITICAL FIX: Sanitize chunk content before processing
          const sanitizedContent = sanitizeTextForDatabase(chunk.content);
          
          errorLogger.debug(`🧹 CONTENT SANITIZED`, {
            user_id: req.userId,
            chunk_id: chunkId,
            original_length: chunk.content.length,
            sanitized_length: sanitizedContent.length,
            content_changed: chunk.content !== sanitizedContent,
            component: 'DocumentUpload'
          });

          // Generate embedding for the sanitized chunk
          let embedding;
          let embeddingSource = 'unknown';
          
          try {
            // ENHANCED: Log embedding generation attempt
            errorLogger.debug('🧠 ATTEMPTING EMBEDDING GENERATION', {
              user_id: req.userId,
              chunk_id: chunkId,
              content_length: sanitizedContent.length,
              runpod_configured: !!process.env.RUNPOD_EMBEDDING_URL,
              runpod_url: process.env.RUNPOD_EMBEDDING_URL,
              component: 'DocumentUpload'
            });

            // Try TxAgent first if available
            if (process.env.RUNPOD_EMBEDDING_URL) {
              errorLogger.debug('Attempting TxAgent embedding', {
                user_id: req.userId,
                chunk_id: chunkId,
                runpod_url: process.env.RUNPOD_EMBEDDING_URL,
                component: 'DocumentUpload'
              });

              embedding = await embeddingService.generateEmbedding(sanitizedContent, req.headers.authorization);
              embeddingSource = 'runpod';
              
              errorLogger.debug('✅ TXAGENT EMBEDDING COMPLETED', {
                user_id: req.userId,
                chunk_id: chunkId,
                dimensions: embedding?.length || 0,
                embedding_preview: embedding?.slice(0, 5) || [],
                component: 'DocumentUpload'
              });
            } else {
              throw new Error('TxAgent not configured - RUNPOD_EMBEDDING_URL missing');
            }
          } catch (embeddingError) {
            errorLogger.warn(`❌ TxAgent embedding failed for chunk ${i + 1}, trying OpenAI fallback`, {
              user_id: req.userId,
              chunk_id: chunkId,
              error: embeddingError.message,
              error_stack: embeddingError.stack,
              component: 'DocumentUpload'
            });
            
            try {
              errorLogger.debug('🔄 ATTEMPTING OPENAI EMBEDDING FALLBACK', {
                user_id: req.userId,
                chunk_id: chunkId,
                openai_configured: !!process.env.OPENAI_API_KEY,
                component: 'DocumentUpload'
              });

              embedding = await embeddingService.generateEmbedding(sanitizedContent, req.headers.authorization);
              embeddingSource = 'openai';
              
              errorLogger.debug('✅ OPENAI EMBEDDING COMPLETED', {
                user_id: req.userId,
                chunk_id: chunkId,
                dimensions: embedding?.length || 0,
                embedding_preview: embedding?.slice(0, 5) || [],
                component: 'DocumentUpload'
              });
            } catch (localEmbeddingError) {
              errorLogger.error(`❌ BOTH EMBEDDING SERVICES FAILED for chunk ${i + 1}`, localEmbeddingError, {
                user_id: req.userId,
                chunk_id: chunkId,
                txagent_error: embeddingError.message,
                openai_error: localEmbeddingError.message,
                component: 'DocumentUpload'
              });
              throw localEmbeddingError;
            }
          }

          // CRITICAL: Validate embedding dimensions before database insertion
          try {
            validateEmbeddingDimensions(embedding, embeddingSource);
            
            errorLogger.debug('✅ EMBEDDING DIMENSION VALIDATION PASSED', {
              user_id: req.userId,
              chunk_id: chunkId,
              dimensions: embedding.length,
              expected_dimensions: EXPECTED_EMBEDDING_DIMENSIONS,
              embedding_source: embeddingSource,
              component: 'DocumentUpload'
            });
          } catch (dimensionError) {
            errorLogger.error('❌ EMBEDDING DIMENSION VALIDATION FAILED', dimensionError, {
              user_id: req.userId,
              chunk_id: chunkId,
              actual_dimensions: embedding?.length || 0,
              expected_dimensions: EXPECTED_EMBEDDING_DIMENSIONS,
              embedding_source: embeddingSource,
              component: 'DocumentUpload'
            });
            throw dimensionError;
          }

          // Prepare chunk data for database with sanitized content
          const chunkData = {
            id: chunkId,
            filename: req.file.originalname,
            content: sanitizedContent, // Use sanitized content for database storage
            metadata: {
              ...originalMetadata,
              ...chunk.metadata,
              file_size: req.file.size,
              mime_type: req.file.mimetype,
              embedding_source: embeddingSource,
              embedding_dimensions: embedding.length,
              processing_time_ms: Date.now() - startTime,
              is_chunk: true,
              parent_document: req.file.originalname,
              content_sanitized: chunk.content !== sanitizedContent // Track if content was modified
            },
            embedding,
            user_id: req.userId
          };

          // ENHANCED: Log database insertion attempt
          errorLogger.debug(`💾 ATTEMPTING DATABASE INSERT for chunk ${i + 1}`, {
            user_id: req.userId,
            chunk_id: chunkId,
            content_length: sanitizedContent.length,
            embedding_dimensions: embedding.length,
            metadata_keys: Object.keys(chunkData.metadata),
            component: 'DocumentUpload'
          });

          // Store chunk in database
          const { data, error } = await supabaseClient
            .from('documents')
            .insert(chunkData)
            .select()
            .single();

          if (error) {
            errorLogger.error(`❌ DATABASE INSERT FAILED for chunk ${i + 1}`, error, {
              user_id: req.userId,
              chunk_id: chunkId,
              error_code: error.code,
              error_message: error.message,
              error_details: error.details,
              error_hint: error.hint,
              supabase_error: error,
              component: 'DocumentUpload'
            });
            throw error;
          }

          processedChunks.push({
            chunk_id: chunkId,
            chunk_index: i,
            content_length: sanitizedContent.length,
            embedding_dimensions: embedding.length,
            embedding_source: embeddingSource,
            content_sanitized: chunk.content !== sanitizedContent,
            database_id: data.id
          });

          errorLogger.debug(`✅ CHUNK ${i + 1}/${chunks.length} PROCESSED SUCCESSFULLY`, {
            user_id: req.userId,
            chunk_id: chunkId,
            embedding_dimensions: embedding.length,
            database_id: data.id,
            component: 'DocumentUpload'
          });

        } catch (chunkError) {
          const chunkErrorMessage = chunkError instanceof Error ? chunkError.message : 'Unknown chunk error';
          
          errorLogger.error(`❌ FAILED TO PROCESS CHUNK ${i + 1}`, chunkError, {
            user_id: req.userId,
            chunk_id: chunkId,
            chunk_index: i,
            error: chunkErrorMessage,
            error_code: chunkError.code,
            error_details: chunkError.details,
            error_stack: chunkError.stack,
            content_preview: chunk.content.substring(0, 100) + '...',
            component: 'DocumentUpload'
          });

          failedChunks.push({
            chunk_index: i,
            error: chunkErrorMessage,
            error_code: chunkError.code,
            content_preview: chunk.content.substring(0, 100) + '...'
          });
        }
      }

      const processingTime = Date.now() - startTime;

      // ENHANCED: Log final processing results
      errorLogger.info('🏁 UPLOAD PROCESSING COMPLETED', {
        user_id: req.userId,
        filename: req.file.originalname,
        total_chunks: chunks.length,
        successful_chunks: processedChunks.length,
        failed_chunks: failedChunks.length,
        processing_time_ms: processingTime,
        success_rate: `${Math.round((processedChunks.length / chunks.length) * 100)}%`,
        component: 'DocumentUpload'
      });

      // Determine response based on success/failure ratio
      if (processedChunks.length === 0) {
        errorLogger.error('❌ ALL CHUNKS FAILED TO PROCESS', new Error('Complete upload failure'), {
          user_id: req.userId,
          filename: req.file.originalname,
          total_chunks: chunks.length,
          failed_chunks: failedChunks.length,
          failures: failedChunks,
          component: 'DocumentUpload'
        });

        return res.status(500).json({
          error: 'Failed to process any chunks from the document',
          details: {
            total_chunks: chunks.length,
            failed_chunks: failedChunks.length,
            failures: failedChunks
          }
        });
      }

      // Success response (partial or complete)
      const isPartialSuccess = failedChunks.length > 0;
      
      errorLogger.success('✅ DOCUMENT UPLOAD COMPLETED', {
        user_id: req.userId,
        filename: req.file.originalname,
        total_chunks: chunks.length,
        successful_chunks: processedChunks.length,
        failed_chunks: failedChunks.length,
        processing_time_ms: processingTime,
        is_partial_success: isPartialSuccess,
        content_sanitization_applied: processedChunks.some(chunk => chunk.content_sanitized),
        component: 'DocumentUpload'
      });

      res.json({
        message: isPartialSuccess 
          ? 'Document partially processed - some chunks failed'
          : 'Document uploaded and processed successfully',
        filename: req.file.originalname,
        total_chunks: chunks.length,
        successful_chunks: processedChunks.length,
        failed_chunks: failedChunks.length,
        processing_time_ms: processingTime,
        chunks: processedChunks,
        failures: failedChunks.length > 0 ? failedChunks : undefined,
        document_stats: {
          original_size: req.file.size,
          total_content_length: originalMetadata.original_length,
          average_chunk_size: Math.round(originalMetadata.original_length / chunks.length),
          embedding_dimensions: processedChunks[0]?.embedding_dimensions || null,
          content_sanitization_applied: processedChunks.some(chunk => chunk.content_sanitized)
        }
      });
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      errorLogger.error('💥 UPLOAD PROCESSING FAILED', error, {
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
        details: error.message,
        processing_time_ms: processingTime
      });
    }
  });

  return router;
}

// Legacy export for backward compatibility
export const documentsRouter = createDocumentsRouter;