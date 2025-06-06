import pdfParse from 'pdf-parse-debugging-disabled';
import mammoth from 'mammoth';
import { marked } from 'marked';

export class DocumentProcessor {
  constructor() {
    console.log('DocumentProcessor initialized');
  }

  async extractText(buffer, filename) {
    const extension = this.getFileExtension(filename).toLowerCase();
    
    try {
      switch (extension) {
        case '.pdf':
          return await this.extractFromPDF(buffer);
        case '.docx':
          return await this.extractFromDOCX(buffer);
        case '.md':
          return await this.extractFromMarkdown(buffer);
        case '.txt':
          return await this.extractFromTXT(buffer);
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      console.error(`Error extracting text from ${filename}:`, error);
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