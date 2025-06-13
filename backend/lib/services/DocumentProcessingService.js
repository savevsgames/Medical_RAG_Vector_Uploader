import { errorLogger } from "../../agent_utils/shared/logger.js";
// import { createWorker } from "tesseract.js";
import mammoth from "mammoth";
export class DocumentProcessingService {
  constructor() {
    this.supportedFormats = [".pdf", ".docx", ".txt", ".md"];
    this.logger = errorLogger;
  }

  async extractText(buffer, filename) {
    try {
      this.logger.info("Starting text extraction", {
        filename,
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });

      let extractedText = "";
      let extractionMetadata = {};

      // Determine file type and extract accordingly
      const fileExtension = this.getFileExtension(filename);

      switch (fileExtension) {
        case "pdf":
          const pdfResult = await this.extractPdfText(buffer);
          extractedText = pdfResult.text;
          extractionMetadata = pdfResult.metadata;
          break;

        case "docx":
          const docxResult = await this.extractDocxText(buffer);
          extractedText = docxResult.text;
          extractionMetadata = docxResult.metadata;
          break;

        case "txt":
        case "md":
          extractedText = buffer.toString("utf8");
          // Clean the text
          extractedText = extractedText
            .replace(/\x00/g, "") // Remove null bytes
            .replace(/[\uD800-\uDFFF]/g, "?") // Replace invalid Unicode surrogates
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();

          extractionMetadata = {
            originalLength: extractedText.length,
            extractionMethod: "utf8-decode",
          };
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content extracted from document");
      }

      // FIXED: Use the new chunking method with proper size limits
      const chunks = this.splitIntoChunks(extractedText, 3000, 200);

      this.logger.info("Document processing completed", {
        filename,
        extractedLength: extractedText.length,
        chunksCreated: chunks.length,
        avgChunkSize: Math.round(extractedText.length / chunks.length),
        component: "DocumentProcessingService",
      });

      return {
        chunks,
        originalMetadata: {
          filename,
          original_length: extractedText.length,
          chunk_count: chunks.length,
          extraction_method: extractionMetadata.extractionMethod,
          ...extractionMetadata,
        },
      };
    } catch (error) {
      this.logger.error("Text extraction failed", {
        filename,
        error: error.message,
        component: "DocumentProcessingService",
      });
      throw error;
    }
  }

  async extractPdfText(buffer) {
    try {
      // Dynamic import for pdf-parse
      const pdfParse = (await import("pdf-parse")).default;

      this.logger.debug("Starting PDF text extraction", {
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });

      const data = await pdfParse(buffer, {
        // Options for better text extraction
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      const extractedText = data.text;

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content found in PDF");
      }

      // Clean the extracted text
      const cleanText = extractedText
        .replace(/\x00/g, "") // Remove null bytes
        .replace(/[\uD800-\uDFFF]/g, "?") // Replace invalid Unicode surrogates
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      this.logger.info("PDF text extraction completed", {
        originalLength: extractedText.length,
        cleanedLength: cleanText.length,
        pageCount: data.numpages,
        component: "DocumentProcessingService",
      });

      return {
        text: cleanText,
        metadata: {
          pageCount: data.numpages,
          originalLength: extractedText.length,
          cleanedLength: cleanText.length,
          extractionMethod: "pdf-parse",
        },
      };
    } catch (error) {
      this.logger.error("PDF text extraction failed", {
        error: error.message,
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  async extractDocxText(buffer) {
    try {
      this.logger.debug("Starting DOCX text extraction", {
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });

      const result = await mammoth.extractRawText({ buffer });
      const extractedText = result.value;

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content found in DOCX");
      }

      // Clean the extracted text
      const cleanText = extractedText
        .replace(/\x00/g, "") // Remove null bytes
        .replace(/[\uD800-\uDFFF]/g, "?") // Replace invalid Unicode surrogates
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      this.logger.info("DOCX text extraction completed", {
        originalLength: extractedText.length,
        cleanedLength: cleanText.length,
        component: "DocumentProcessingService",
      });

      return {
        text: cleanText,
        metadata: {
          originalLength: extractedText.length,
          cleanedLength: cleanText.length,
          extractionMethod: "mammoth",
        },
      };
    } catch (error) {
      this.logger.error("DOCX text extraction failed", {
        error: error.message,
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });
      throw new Error(`DOCX text extraction failed: ${error.message}`);
    }
  }

  // async extractFromText(buffer, filename) {
  //   try {
  //     const text = buffer.toString("utf8");

  //     return {
  //       text,
  //       metadata: {
  //         char_count: text.length,
  //         extraction_method: "utf8",
  //       },
  //     };
  //   } catch (error) {
  //     errorLogger.error("Text extraction failed", error, {
  //       filename,
  //       component: "DocumentProcessingService",
  //     });
  //     throw new Error(`Text extraction failed: ${error.message}`);
  //   }
  // }

  splitIntoChunks(text, maxCharsPerChunk = 3000, overlap = 200) {
    if (!text || typeof text !== "string") {
      throw new Error("Invalid text input for chunking");
    }

    // Clean the text first

    const cleanText = text
      .replace(/\x00/g, "") // Remove null bytes
      .replace(/[\uD800-\uDFFF]/g, "?") // Replace invalid Unicode surrogates
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    if (cleanText.length === 0) {
      throw new Error("No valid text content after cleaning");
    }

    const chunks = [];
    let startIndex = 0;

    while (startIndex < cleanText.length) {
      let endIndex = Math.min(startIndex + maxCharsPerChunk, cleanText.length);

      // Try to break at sentence boundaries if possible
      if (endIndex < cleanText.length) {
        const lastPeriod = cleanText.lastIndexOf(".", endIndex);
        const lastNewline = cleanText.lastIndexOf("\n", endIndex);
        const lastSpace = cleanText.lastIndexOf(" ", endIndex);

        // Use the best break point
        const breakPoint = Math.max(lastPeriod, lastNewline, lastSpace);
        if (breakPoint > startIndex + maxCharsPerChunk * 0.5) {
          endIndex = breakPoint + 1;
        }
      }

      const chunk = cleanText.slice(startIndex, endIndex).trim();

      if (chunk.length > 0) {
        chunks.push({
          content: chunk,
          metadata: {
            chunk_index: chunks.length,
            start_char: startIndex,
            end_char: endIndex,
            char_count: chunk.length,
            word_count: chunk.split(/\s+/).length,
          },
        });
      }

      // Move start index with overlap
      startIndex = Math.max(endIndex - overlap, startIndex + 1);

      // Prevent infinite loop
      if (startIndex >= endIndex) {
        startIndex = endIndex;
      }
    }

    this.logger.info("Text chunking completed", {
      originalLength: cleanText.length,
      chunksCreated: chunks.length,
      avgChunkSize: Math.round(cleanText.length / chunks.length),
      maxChunkSize: Math.max(...chunks.map((c) => c.content.length)),
      minChunkSize: Math.min(...chunks.map((c) => c.content.length)),
      component: "DocumentProcessingService",
    });

    return chunks;
  }

  getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf("."));
  }

  isSupported(filename) {
    const extension = this.getFileExtension(filename);
    return this.supportedFormats.includes(extension);
  }
}
