import path from "path";
import mammoth from "mammoth";
import { errorLogger } from "../../agent_utils/shared/logger.js";
import { createRequire } from "module";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
  "pdfjs-dist/legacy/build/pdf.worker.mjs"
);

export class DocumentProcessingService {
  static MAX_CHUNK_SIZE = 2000;
  static OVERLAP = 200;

  constructor() {
    this.logger = errorLogger;
    this.supportedFormats = [".pdf", ".docx", ".txt", ".md"];
  }

  async extractText(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();

    let rawText = "";
    let metadata = {};

    try {
      this.logger.info("Starting text extraction", {
        filename,
        bufferSize: buffer.length,
        component: "DocumentProcessingService",
      });

      switch (ext) {
        case ".pdf":
          ({ rawText, metadata } = await this.#extractPdfText(buffer));
          break;
        case ".docx":
          ({ rawText, metadata } = await this.#extractDocxText(buffer));
          break;
        case ".txt":
        case ".md":
          rawText = buffer
            .toString("utf8")
            .replace(/\x00/g, "")
            .replace(/[\uD800-\uDFFF]/g, "?")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();
          metadata = {
            mime_type: ext === ".txt" ? "text/plain" : "text/markdown",
            extraction_method: "utf8-decode",
          };
          break;
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error("No text content extracted from document");
      }

      const chunks = this.#chunkText(rawText);

      this.logger.info("Document processing completed", {
        filename,
        extractedLength: rawText.length,
        chunksCreated: chunks.length,
        avgChunkSize: Math.round(rawText.length / chunks.length),
        component: "DocumentProcessingService",
      });

      return {
        chunks,
        originalMetadata: {
          ...metadata,
          filename,
          original_length: rawText.length,
          chunk_count: chunks.length,
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

  // PDF extraction using pdfjs-dist (no fs access)
  async #extractPdfText(buffer) {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let text = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const { items } = await page.getTextContent();
      text += items.map((i) => i.str).join(" ") + "\n";
    }

    return {
      rawText: text,
      metadata: {
        mime_type: "application/pdf",
        page_count: pdf.numPages,
        extraction_method: "pdfjs-dist",
      },
    };
  }

  // DOCX extraction using mammoth
  async #extractDocxText(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const extractedText = result.value;

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text content found in DOCX");
    }

    const cleanText = extractedText
      .replace(/\x00/g, "")
      .replace(/[\uD800-\uDFFF]/g, "?")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\s+/g, " ")
      .trim();

    return {
      rawText: cleanText,
      metadata: {
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extraction_method: "mammoth",
      },
    };
  }

  // Chunking helper (simple, non-overlapping for clarity; add overlap if needed)
  #chunkText(text) {
    const chunks = [];
    for (
      let i = 0;
      i < text.length;
      i += DocumentProcessingService.MAX_CHUNK_SIZE
    ) {
      const slice = text.slice(i, i + DocumentProcessingService.MAX_CHUNK_SIZE);
      chunks.push({
        content: slice,
        metadata: {
          chunk_index: chunks.length,
          chunk_count: Math.ceil(
            text.length / DocumentProcessingService.MAX_CHUNK_SIZE
          ),
        },
      });
    }
    return chunks;
  }
}
