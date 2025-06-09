import { errorLogger } from '../../agent_utils/shared/logger.js';

export class DocumentProcessingService {
  constructor() {
    this.supportedFormats = ['.pdf', '.docx', '.txt', '.md'];
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
        extraction_method: 'unknown'
      };

      switch (extension) {
        case '.pdf':
          ({ text, metadata } = await this.extractFromPDF(buffer, filename));
          break;
        case '.docx':
          ({ text, metadata } = await this.extractFromDOCX(buffer, filename));
          break;
        case '.txt':
        case '.md':
          ({ text, metadata } = await this.extractFromText(buffer, filename));
          break;
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }

      // Create chunks from the extracted text
      const chunks = this.createChunks(text, filename);
      
      // Update metadata with chunking info
      const originalMetadata = {
        ...metadata,
        original_length: text.length,
        chunk_count: chunks.length
      };

      errorLogger.success('Text extraction and chunking completed', {
        filename,
        extension,
        original_text_length: text.length,
        chunks_created: chunks.length,
        metadata: originalMetadata,
        component: 'DocumentProcessingService'
      });

      return {
        chunks,
        originalMetadata
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
      // CRITICAL FIX: Use dynamic import to prevent startup crashes
      const pdfParse = await import('pdf-parse');
      
      // Handle both default and named exports
      const pdfParseFunction = pdfParse.default || pdfParse;
      
      errorLogger.debug('PDF parsing with pdf-parse library', {
        filename,
        buffer_size: buffer.length,
        component: 'DocumentProcessingService'
      });

      const data = await pdfParseFunction(buffer);
      
      return {
        text: data.text,
        metadata: {
          char_count: data.text.length,
          page_count: data.numpages,
          extraction_method: 'pdf-parse'
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

      errorLogger.warn('Attempting fallback text extraction for PDF', {
        filename,
        component: 'DocumentProcessingService'
      });

      // Fallback: try to extract as UTF-8 text
      try {
        const text = buffer.toString('utf8');
        return {
          text,
          metadata: {
            char_count: text.length,
            extraction_method: 'fallback-utf8',
            warning: 'PDF parsing failed, used fallback method'
          }
        };
      } catch (fallbackError) {
        errorLogger.error('Fallback extraction also failed', fallbackError, {
          filename,
          component: 'DocumentProcessingService'
        });
        throw new Error(`PDF extraction failed: ${error.message}`);
      }
    }
  }

  async extractFromDOCX(buffer, filename) {
    try {
      // Dynamic import for mammoth
      const mammoth = await import('mammoth');
      const mammothFunction = mammoth.default || mammoth;
      
      const result = await mammothFunction.extractRawText({ buffer });
      
      return {
        text: result.value,
        metadata: {
          char_count: result.value.length,
          extraction_method: 'mammoth',
          messages: result.messages
        }
      };
    } catch (error) {
      errorLogger.error('DOCX extraction failed', error, {
        filename,
        component: 'DocumentProcessingService'
      });
      
      // Fallback for DOCX
      try {
        const text = buffer.toString('utf8');
        return {
          text,
          metadata: {
            char_count: text.length,
            extraction_method: 'fallback-utf8',
            warning: 'DOCX parsing failed, used fallback method'
          }
        };
      } catch (fallbackError) {
        throw new Error(`DOCX extraction failed: ${error.message}`);
      }
    }
  }

  async extractFromText(buffer, filename) {
    try {
      const text = buffer.toString('utf8');
      
      return {
        text,
        metadata: {
          char_count: text.length,
          extraction_method: 'utf8'
        }
      };
    } catch (error) {
      errorLogger.error('Text extraction failed', error, {
        filename,
        component: 'DocumentProcessingService'
      });
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  createChunks(text, filename, chunkSize = 4000, overlap = 200) {
    const chunks = [];
    const words = text.split(/\s+/);
    
    if (words.length === 0) {
      return [{
        content: text,
        metadata: {
          chunk_index: 0,
          chunk_size: text.length,
          source_file: filename
        }
      }];
    }

    // Calculate approximate words per chunk
    const avgWordsPerChunk = Math.floor(chunkSize / 5); // Assuming ~5 chars per word
    const overlapWords = Math.floor(overlap / 5);

    let currentIndex = 0;
    let chunkIndex = 0;

    while (currentIndex < words.length) {
      const endIndex = Math.min(currentIndex + avgWordsPerChunk, words.length);
      const chunkWords = words.slice(currentIndex, endIndex);
      const chunkText = chunkWords.join(' ');

      chunks.push({
        content: chunkText,
        metadata: {
          chunk_index: chunkIndex,
          chunk_size: chunkText.length,
          word_count: chunkWords.length,
          source_file: filename,
          start_word: currentIndex,
          end_word: endIndex - 1
        }
      });

      // Move to next chunk with overlap
      currentIndex = Math.max(currentIndex + avgWordsPerChunk - overlapWords, currentIndex + 1);
      chunkIndex++;

      // Prevent infinite loop
      if (currentIndex >= words.length) break;
    }

    return chunks;
  }

  getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  isSupported(filename) {
    const extension = this.getFileExtension(filename);
    return this.supportedFormats.includes(extension);
  }
}