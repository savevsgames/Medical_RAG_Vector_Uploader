import { errorLogger } from '../../agent_utils/shared/logger.js';

export class DocumentProcessingService {
  constructor() {
    this.supportedExtensions = ['.pdf', '.docx', '.txt', '.md'];
  }

  async extractText(buffer, filename) {
    const extension = this.getFileExtension(filename);
    
    errorLogger.info('Starting text extraction', {
      filename,
      extension,
      buffer_size: buffer.length,
      component: 'DocumentProcessingService'
    });

    try {
      let text = '';
      let metadata = {
        char_count: 0,
        extraction_method: 'unknown',
        original_length: 0
      };

      switch (extension) {
        case '.pdf':
          const pdfResult = await this.extractFromPDF(buffer, filename);
          text = pdfResult.text;
          metadata = { ...metadata, ...pdfResult.metadata };
          break;
        case '.docx':
          const docxResult = await this.extractFromDOCX(buffer, filename);
          text = docxResult.text;
          metadata = { ...metadata, ...docxResult.metadata };
          break;
        case '.txt':
        case '.md':
          const textResult = this.extractFromText(buffer, filename);
          text = textResult.text;
          metadata = { ...metadata, ...textResult.metadata };
          break;
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }

      if (!text || text.trim().length === 0) {
        throw new Error('No text content extracted from document');
      }

      // Update metadata with final text length
      metadata.char_count = text.length;
      metadata.original_length = text.length;

      // Create chunks from the extracted text
      const chunks = this.createChunks(text, filename, metadata);

      errorLogger.success('Text extraction and chunking completed', {
        filename,
        extension,
        original_text_length: text.length,
        chunks_created: chunks.length,
        metadata,
        component: 'DocumentProcessingService'
      });

      return {
        chunks,
        originalMetadata: metadata
      };

    } catch (error) {
      errorLogger.error('Text extraction failed', error, {
        filename,
        extension,
        error_message: error.message,
        component: 'DocumentProcessingService'
      });
      throw error;
    }
  }

  async extractFromPDF(buffer, filename) {
    try {
      // CRITICAL FIX: Dynamic import to prevent startup crashes
      const pdfParse = await import('pdf-parse');
      const pdf = pdfParse.default || pdfParse;
      
      errorLogger.debug('Attempting PDF extraction with pdf-parse', {
        filename,
        component: 'DocumentProcessingService'
      });

      const data = await pdf(buffer);
      
      return {
        text: data.text,
        metadata: {
          page_count: data.numpages,
          extraction_method: 'pdf-parse',
          pdf_info: data.info
        }
      };
    } catch (error) {
      errorLogger.error('PDF extraction failed', {
        filename,
        error_message: error.message,
        error_stack: error.stack,
        component: 'DocumentProcessingService',
        error_code: error.code
      });

      // ENHANCED: Fallback to simple text extraction
      errorLogger.warn('Attempting fallback text extraction for PDF', {
        filename,
        component: 'DocumentProcessingService'
      });

      try {
        // Simple UTF-8 decoding as fallback
        const fallbackText = buffer.toString('utf8');
        
        // Basic cleanup for PDF-like content
        const cleanedText = fallbackText
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control characters
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        if (cleanedText.length > 100) { // Reasonable threshold for valid text
          return {
            text: cleanedText,
            metadata: {
              extraction_method: 'fallback-utf8',
              warning: 'PDF parsing failed, used fallback method'
            }
          };
        }
      } catch (fallbackError) {
        errorLogger.error('Fallback PDF extraction also failed', fallbackError, {
          filename,
          component: 'DocumentProcessingService'
        });
      }

      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async extractFromDOCX(buffer, filename) {
    try {
      // Dynamic import to prevent potential startup issues
      const mammoth = await import('mammoth');
      
      errorLogger.debug('Attempting DOCX extraction with mammoth', {
        filename,
        component: 'DocumentProcessingService'
      });

      const result = await mammoth.extractRawText({ buffer });
      
      return {
        text: result.value,
        metadata: {
          extraction_method: 'mammoth',
          messages: result.messages
        }
      };
    } catch (error) {
      errorLogger.error('DOCX extraction failed', error, {
        filename,
        error_message: error.message,
        component: 'DocumentProcessingService'
      });
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  extractFromText(buffer, filename) {
    try {
      errorLogger.debug('Extracting text from plain text file', {
        filename,
        component: 'DocumentProcessingService'
      });

      const text = buffer.toString('utf8');
      
      return {
        text,
        metadata: {
          extraction_method: 'utf8-decode'
        }
      };
    } catch (error) {
      errorLogger.error('Text extraction failed', error, {
        filename,
        error_message: error.message,
        component: 'DocumentProcessingService'
      });
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  createChunks(text, filename, originalMetadata) {
    const chunkSize = 4000; // Characters per chunk
    const chunkOverlap = 200; // Overlap between chunks
    
    const chunks = [];
    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      let chunkText = text.slice(startIndex, endIndex);

      // Try to break at sentence boundaries for better semantic coherence
      if (endIndex < text.length) {
        const lastSentenceEnd = Math.max(
          chunkText.lastIndexOf('.'),
          chunkText.lastIndexOf('!'),
          chunkText.lastIndexOf('?')
        );
        
        if (lastSentenceEnd > chunkSize * 0.7) { // Only if we're not cutting too much
          chunkText = chunkText.slice(0, lastSentenceEnd + 1);
        }
      }

      chunks.push({
        content: chunkText.trim(),
        metadata: {
          ...originalMetadata,
          chunk_index: chunkIndex,
          chunk_start: startIndex,
          chunk_end: startIndex + chunkText.length,
          chunk_size: chunkText.length,
          source_filename: filename
        }
      });

      // Move to next chunk with overlap
      startIndex += chunkText.length - chunkOverlap;
      chunkIndex++;

      // Prevent infinite loop
      if (startIndex >= text.length - chunkOverlap) {
        break;
      }
    }

    errorLogger.debug('Text chunking completed', {
      filename,
      original_length: text.length,
      chunks_created: chunks.length,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      component: 'DocumentProcessingService'
    });

    return chunks;
  }

  getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  isSupported(filename) {
    const extension = this.getFileExtension(filename);
    return this.supportedExtensions.includes(extension);
  }
}