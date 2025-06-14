import express from "express";
import { v4 as uuidv4 } from "uuid";
import {
  DocumentProcessingService,
  EmbeddingService,
} from "../lib/services/index.js";
import { upload } from "../middleware/upload.js";
import { verifyToken } from "../middleware/auth.js";
import { errorLogger } from "../agent_utils/shared/logger.js";

export function createDocumentsRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    throw new Error(
      "Invalid Supabase client provided to createDocumentsRouter"
    );
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
    if (!text || typeof text !== "string") return text;

    return (
      text
        // Replace single backslashes with double backslashes to prevent escape sequence interpretation
        .replace(/\\/g, "\\\\")
        // Remove or replace other problematic Unicode sequences
        .replace(/\u0000/g, "") // Remove null bytes
        // Replace invalid Unicode surrogates
        .replace(/[\uD800-\uDFFF]/g, "?")
        // Normalize line endings
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
    );
  };

  // Validate embedding dimensions
  const validateEmbeddingDimensions = (embedding, embeddingSource) => {
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid embedding: not an array");
    }

    if (embedding.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
      const errorMessage = `Embedding dimension mismatch: expected ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length} from ${embeddingSource}`;

      if (embeddingSource === "runpod" && embedding.length === 1536) {
        throw new Error(
          `${errorMessage}. TxAgent container is using OpenAI embeddings (1536D) instead of BioBERT (768D). ` +
            `Please check your TxAgent container configuration to ensure it's using the correct BioBERT model.`
        );
      } else if (embeddingSource === "openai" && embedding.length === 1536) {
        throw new Error(
          `${errorMessage}. OpenAI embeddings (1536D) are incompatible with this system. ` +
            `Please ensure TxAgent is configured and running to generate compatible ${EXPECTED_EMBEDDING_DIMENSIONS}D embeddings.`
        );
      } else {
        throw new Error(errorMessage);
      }
    }

    return true;
  };

  // Enhanced document upload endpoint with comprehensive logging
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      // 1. Upload file to Supabase Storage first
      const { data: uploadData, error: uploadError } =
        await supabaseClient.storage
          .from("documents")
          .upload(`${req.userId}/${req.file.originalname}`, req.file.buffer);

      if (uploadError) throw uploadError;

      // 2. Tell TxAgent to process the document
      const txAgentResponse = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/process-document`,
        {
          method: "POST",
          headers: {
            Authorization: req.headers.authorization, // Pass through JWT
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_path: uploadData.path,
          }),
        }
      );

      if (!txAgentResponse.ok) {
        throw new Error(`TxAgent processing failed: ${txAgentResponse.status}`);
      }

      const result = await txAgentResponse.json();

      res.json({
        success: true,
        message: "Document uploaded and processing started",
        file_path: uploadData.path,
        processing_result: result,
      });
    } catch (error) {
      errorLogger.error("Upload failed", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/test-upload", async (req, res) => {
    try {
      // Test 1: Can we reach TxAgent?
      const healthResponse = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/health`
      );
      const healthOk = healthResponse.ok;

      // Test 2: Can we generate an embedding?
      let embeddingTest = null;
      try {
        const embedResponse = await fetch(
          `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Hello world" }),
          }
        );
        embeddingTest = await embedResponse.json();
      } catch (e) {
        embeddingTest = { error: e.message };
      }

      // Test 3: Can we write to Supabase?
      let supabaseTest = null;
      try {
        const { data, error } = await supabaseClient
          .from("documents")
          .select("count(*)")
          .limit(1);
        supabaseTest = error ? { error: error.message } : { success: true };
      } catch (e) {
        supabaseTest = { error: e.message };
      }

      res.json({
        txagent_health: healthOk,
        embedding_test: embeddingTest,
        supabase_test: supabaseTest,
        env_vars: {
          has_runpod_url: !!process.env.RUNPOD_EMBEDDING_URL,
          has_supabase_url: !!process.env.SUPABASE_URL,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// Legacy export for backward compatibility
export const documentsRouter = createDocumentsRouter;
