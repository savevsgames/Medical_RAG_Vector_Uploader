import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { errorLogger } from '../../agent_utils/shared/logger.js';

export class DocumentProcessingService {
  constructor() {
    this.supportedTypes = {
      'application/pdf': this.extractFromPDF.bind(this),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': this.extractFromDOCX.bind(this),
      'text/plain': this.extractFromText.bind(this),
      'text/markdown': this.extractFromText.bind(this)
    };

    // Chunking configuration
    this.chunkConfig = {
      maxChunkSize: 4000,        // ~1000 tokens (safe for 8192 limit)
      overlapSize: 400,          // 10% overlap for context preservation
      minChunkSize: 200,         // Minimum viable chunk size
      sentenceBoundary: true,    // Try to break at sentence boundaries
      paragraphBoundary: true    // Prefer paragraph boundaries
    };
  }

  async extractText(buffer, filename) {
    const extension = this.getFileExtension(filename);
    const mimeType = this.getMimeTypeFromExtension(extension);

    errorLogger.info('Starting text extraction', {
      filename,
      extension,
      buffer_size: buffer.length,
      component: 'DocumentProcessingService'
    });

    if (!this.supportedTypes[mimeType]) {
      throw new Error(`Unsupported file type: ${extension}`);
    }

    try {
      // Extract raw text and metadata
      const { text, metadata } = await this.supportedTypes[mimeType](buffer, filename);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from the document');
      }

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
        originalMetadata: {
          ...metadata,
          original_length: text.length,
          chunks_count: chunks.length,
          chunking_strategy: 'semantic_overlap'
        }
      };

    } catch (error) {
      errorLogger.error('Text extraction failed', error, {
        filename,
        extension,
        buffer_size: buffer.length,
        component: 'DocumentProcessingService'
      });
      throw error;
    }
  }

  createChunks(text, filename, originalMetadata) {
    const chunks = [];
    const { maxChunkSize, overlapSize, minChunkSize } = this.chunkConfig;

    // First, try to split by paragraphs for better semantic coherence
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    let currentChunk = '';
    let currentPosition = 0;
    let chunkIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;

      if (potentialChunk.length <= maxChunkSize) {
        // Paragraph fits in current chunk
        currentChunk = potentialChunk;
      } else {
        // Current chunk is full, save it and start new one
        if (currentChunk.length >= minChunkSize) {
          chunks.push(this.createChunkObject(
            currentChunk, 
            chunkIndex++, 
            currentPosition, 
            filename, 
            originalMetadata
          ));
          
          // Calculate overlap for next chunk
          const overlapText = this.getOverlapText(currentChunk, overlapSize);
          currentPosition += currentChunk.length - overlapText.length;
          currentChunk = overlapText;
        } else {
          currentChunk = '';
        }

        // Handle large paragraphs that exceed maxChunkSize
        if (paragraph.length > maxChunkSize) {
          // Split large paragraph by sentences
          const sentences = this.splitBySentences(paragraph);
          let sentenceChunk = currentChunk;

          for (const sentence of sentences) {
            if ((sentenceChunk + ' ' + sentence).length <= maxChunkSize) {
              sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
            } else {
              // Save current sentence chunk
              if (sentenceChunk.length >= minChunkSize) {
                chunks.push(this.createChunkObject(
                  sentenceChunk, 
                  chunkIndex++, 
                  currentPosition, 
                  filename, 
                  originalMetadata
                ));
                
                const overlapText = this.getOverlapText(sentenceChunk, overlapSize);
                currentPosition += sentenceChunk.length - overlapText.length;
                sentenceChunk = overlapText + (overlapText ? ' ' : '') + sentence;
              } else {
                sentenceChunk = sentence;
              }
            }
          }
          currentChunk = sentenceChunk;
        } else {
          // Normal paragraph, add to current chunk
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
      }
    }

    // Add final chunk if it has content
    if (currentChunk.length >= minChunkSize) {
      chunks.push(this.createChunkObject(
        currentChunk, 
        chunkIndex++, 
        currentPosition, 
        filename, 
        originalMetadata
      ));
    }

    // Ensure we have at least one chunk
    if (chunks.length === 0 && text.length > 0) {
      chunks.push(this.createChunkObject(
        text.substring(0, maxChunkSize), 
        0, 
        0, 
        filename, 
        originalMetadata
      ));
    }

    return chunks;
  }

  createChunkObject(content, index, startOffset, filename, originalMetadata) {
    return {
      content: content.trim(),
      metadata: {
        chunk_index: index,
        chunk_count: null, // Will be set after all chunks are created
        original_filename: filename,
        start_offset: startOffset,
        end_offset: startOffset + content.length,
        char_count: content.trim().length,
        estimated_tokens: Math.ceil(content.trim().length / 4), // Rough estimate
        chunk_type: 'semantic_paragraph',
        ...originalMetadata
      }
    };
  }

  splitBySentences(text) {
    // Split by sentence boundaries, preserving the sentence-ending punctuation
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  getOverlapText(text, overlapSize) {
    if (text.length <= overlapSize) return text;

    // Try to find a good breaking point (sentence or word boundary)
    const overlapText = text.slice(-overlapSize);
    const sentenceMatch = overlapText.match(/[\.!?]\s+(.*)$/);

    if (sentenceMatch) {
      return sentenceMatch[1]; // Return text after last sentence boundary
    }

    // Fall back to word boundary
    const wordMatch = overlapText.match(/\s+(.*)$/);
    return wordMatch ? wordMatch[1] : overlapText;
  }

  async extractFromPDF(buffer, filename) {
    try {
      const data = await pdf(buffer);

      return {
        text: data.text,
        metadata: {
          page_count: data.numpages,
          char_count: data.text.length,
          info: data.info || {},
          extraction_method: 'pdf-parse'
        }
      };
    } catch (error) {
      errorLogger.error('PDF extraction failed', error, {
        filename,
        component: 'DocumentProcessingService'
      });
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  async extractFromDOCX(buffer, filename) {
    try {
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        metadata: {
          char_count: result.value.length,
          extraction_method: 'mammoth',
          messages: result.messages || []
        }
      };
    } catch (error) {
      errorLogger.error('DOCX extraction failed', error, {
        filename,
        component: 'DocumentProcessingService'
      });
      throw new Error(`Failed to extract text from DOCX: ${error.message}`);
    }
  }

  async extractFromText(buffer, filename) {
    try {
      const text = buffer.toString('utf-8');

      return {
        text,
        metadata: {
          char_count: text.length,
          extraction_method: 'utf-8-decode'
        }
      };
    } catch (error) {
      errorLogger.error('Text extraction failed', error, {
        filename,
        component: 'DocumentProcessingService'
      });
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  // Utility method to estimate token count more accurately
  estimateTokenCount(text) {
    // More sophisticated token estimation
    // Average English word is ~4 characters, but medical text can be denser
    const words = text.split(/\s+/).length;
    const characters = text.length;

    // Use a conservative estimate for medical/technical text
    return Math.ceil(Math.max(words * 1.3, characters / 3.5));
  }

  // Method to validate chunk quality
  validateChunk(chunk) {
    const { content, metadata } = chunk;

    return {
      isValid: content.length >= this.chunkConfig.minChunkSize,
      estimatedTokens: this.estimateTokenCount(content),
      hasOverlap: metadata.chunk_index > 0,
      preservesContext: content.includes('.') || content.includes('!') || content.includes('?')
    };
  }
}