import pdfParse from 'pdf-parse-debugging-disabled';
import mammoth from 'mammoth';
import { logger } from '../../agent_utils/shared/logger.js';

export class DocumentProcessingService {
  constructor() {
    logger.info('DocumentProcessingService initialized', {
      component: 'DocumentProcessingService'
    });
  }

  async extractText(buffer, filename) {
    const extension = this.getFileExtension(filename).toLowerCase();
    
    try {
      logger.info('Starting text extraction', {
        filename,
        extension,
        buffer_size: buffer.length,
        component: 'DocumentProcessingService'
      });

      let result;
      switch (extension) {
        case '.pdf':
          result = await this.extractFromPDF(buffer);
          break;
        case '.docx':
          result = await this.extractFromDOCX(buffer);
          break;
        case '.md':
          result = await this.extractFromMarkdown(buffer);
          break;
        case '.txt':
          result = await this.extractFromTXT(buffer);
          break;
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }

      logger.success('Text extraction completed', {
        filename,
        extension,
        text_length: result.text.length,
        metadata: result.metadata,
        component: 'DocumentProcessingService'
      });

      return result;
    } catch (error) {
      logger.error('Text extraction failed', error, {
        filename,
        extension,
        error_stack: error.stack,
        component: 'DocumentProcessingService'
      });
      throw error;
    }
  }

  getFileExtension(filename) {
    return filename.substring(filename.lastIndexOf('.'));
  }

  async extractFromPDF(buffer) {
    try {
      const data = await pdfParse(buffer);
      
      const metadata = {
        page_count: data.numpages,
        char_count: data.text.length,
        info: data.info || {}
      };

      return {
        text: data.text,
        metadata
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async extractFromDOCX(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      const metadata = {
        char_count: result.value.length,
        warnings: result.messages
      };

      return {
        text: result.value,
        metadata
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  async extractFromMarkdown(buffer) {
    try {
      const text = buffer.toString('utf-8');
      
      const metadata = {
        char_count: text.length,
        line_count: text.split('\n').length
      };

      return {
        text,
        metadata
      };
    } catch (error) {
      throw new Error(`Markdown extraction failed: ${error.message}`);
    }
  }

  async extractFromTXT(buffer) {
    try {
      const text = buffer.toString('utf-8');
      
      const metadata = {
        char_count: text.length,
        line_count: text.split('\n').length
      };

      return {
        text,
        metadata
      };
    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }
}