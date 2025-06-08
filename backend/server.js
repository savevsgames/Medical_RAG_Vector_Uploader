// Enhanced document upload endpoint with comprehensive logging
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      errorLogger.warn('Upload failed - no file provided', { 
        user_id: req.userId,
        ip: req.ip
      });
      return res.status(400).json({ error: 'No file provided' });
    }

    errorLogger.info('Processing upload', {
      user_id: req.userId,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ip: req.ip
    });

    const documentId = uuidv4();
    
    // Extract text from document
    errorLogger.info('Starting text extraction', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname
    });

    const { text, metadata } = await documentProcessor.extractText(
      req.file.buffer, 
      req.file.originalname
    );

    if (!text || text.trim().length === 0) {
      errorLogger.warn('Upload failed - no text extracted', {
        user_id: req.userId,
        filename: req.file.originalname,
        metadata
      });
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    errorLogger.info('Text extraction completed', {
      user_id: req.userId,
      document_id: documentId,
      text_length: text.length,
      metadata
    });

    // Try RunPod embedding first, fallback to local embedding service
    let embedding;
    let embeddingSource = 'local';
    
    try {
      if (process.env.RUNPOD_EMBEDDING_URL) {
        errorLogger.info('Attempting RunPod embedding', {
          user_id: req.userId,
          document_id: documentId,
          text_length: text.length,
          runpod_url: process.env.RUNPOD_EMBEDDING_URL
        });

        const runpodResponse = await axios.post(
          `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
          { 
            file_path: `upload_${documentId}`,
            metadata: {
              ...metadata,
              file_size: req.file.size,
              mime_type: req.file.mimetype,
              inline_text: text,
              user_id: req.userId
            }
          },
          { 
            headers: { 
              'Authorization': req.headers.authorization, // Forward user's JWT
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        // Handle different response formats from TxAgent
        if (runpodResponse.data.document_ids && runpodResponse.data.document_ids.length > 0) {
          // Background processing response
          embeddingSource = 'runpod_processing';
          errorLogger.info('RunPod background processing initiated', {
            user_id: req.userId,
            document_id: documentId,
            document_ids: runpodResponse.data.document_ids,
            chunk_count: runpodResponse.data.chunk_count
          });
          
          // For background processing, use local embedding for immediate storage
          embedding = await embeddingService.generateEmbedding(text);
          embeddingSource = 'local_with_runpod_processing';
        } else if (runpodResponse.data.embedding) {
          // Direct embedding response
          embedding = runpodResponse.data.embedding;
          embeddingSource = 'runpod';
          
          errorLogger.success('RunPod embedding completed', {
            user_id: req.userId,
            document_id: documentId,
            dimensions: embedding.length,
            response_status: runpodResponse.status
          });
        } else {
          throw new Error('Invalid RunPod response format');
        }
      } else {
        throw new Error('RunPod not configured');
      }
    } catch (embeddingError) {
      errorLogger.warn('RunPod embedding failed, using local service', {
        user_id: req.userId,
        document_id: documentId,
        error: embeddingError.message,
        error_code: embeddingError.code,
        status: embeddingError.response?.status
      });
      
      embedding = await embeddingService.generateEmbedding(text);
      embeddingSource = 'local';
      
      errorLogger.info('Local embedding completed', {
        user_id: req.userId,
        document_id: documentId,
        dimensions: embedding?.length
      });
    }

    // CRITICAL DEBUG: Log the exact values before Supabase insert
    errorLogger.debug('Attempting Supabase insert for document', {
      user_id_from_token: req.userId,
      user_id_type: typeof req.userId,
      user_id_length: req.userId?.length,
      filename: req.file.originalname,
      document_id: documentId,
      embedding_dimensions: embedding?.length,
      embedding_source: embeddingSource,
      component: 'UploadRoute'
    });

    // Store in Supabase
    errorLogger.info('Storing document in Supabase', {
      user_id: req.userId,
      document_id: documentId,
      filename: req.file.originalname,
      embedding_source: embeddingSource
    });

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
        component: 'UploadRoute'
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
      supabase_id: data.id
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
      component: 'UploadRoute'
    });
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});