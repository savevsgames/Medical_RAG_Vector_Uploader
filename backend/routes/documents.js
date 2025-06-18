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
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      errorLogger.info("Starting file upload", {
        filename: req.file.originalname,
        size: req.file.size,
        userId: req.userId,
      });

      // Step 1: Upload to Supabase Storage ONLY
      const { data: uploadData, error: uploadError } =
        await supabaseClient.storage
          .from("documents")
          .upload(`${req.userId}/${req.file.originalname}`, req.file.buffer);

      if (uploadError) {
        errorLogger.error("Supabase storage upload failed", uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      errorLogger.info("File uploaded to storage", {
        filePath: uploadData.path,
      });

      // Step 2: Call TxAgent /process-document (NOT /embed)
      const txAgentResponse = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/process-document`,
        {
          method: "POST",
          headers: {
            Authorization: req.headers.authorization, // Pass user's JWT
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_path: uploadData.path,
            metadata: {
              title: req.file.originalname,
              description: "User uploaded document",
              tags: ["medical", "user-upload"],
              source: "User Upload",
            },
          }),
        }
      );

      if (!txAgentResponse.ok) {
        const errorText = await txAgentResponse.text();
        errorLogger.error("TxAgent processing failed", {
          status: txAgentResponse.status,
          error: errorText,
        });
        throw new Error(
          `Document processing failed: ${txAgentResponse.status}`
        );
      }

      const processingResult = await txAgentResponse.json();

      errorLogger.info("Document processing started", {
        jobId: processingResult.job_id,
        filePath: uploadData.path,
      });

      // Return job ID for status monitoring
      res.json({
        success: true,
        message: "Document uploaded and processing started",
        file_path: uploadData.path,
        job_id: processingResult.job_id,
        status: processingResult.status,
      });
    } catch (error) {
      errorLogger.error("Upload failed", {
        error: error.message,
        stack: error.stack,
      });
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

      // Test 3: Can we write to Supabase? (FIXED QUERY)
      let supabaseTest = null;
      try {
        const { data, error, count } = await supabaseClient
          .from("documents")
          .select("id", { count: "exact", head: true })
          .limit(1);

        supabaseTest = error
          ? { error: error.message }
          : {
              success: true,
              total_documents: count,
            };
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

  // Add this to your documents.js router
  router.post("/debug-upload", upload.single("file"), async (req, res) => {
    try {
      const debugInfo = {
        step1_file_received: false,
        step2_supabase_storage: false,
        step3_txagent_reachable: false,
        step4_txagent_process: false,
        errors: [],
        details: {},
      };

      // Step 1: Check if file was received
      if (req.file) {
        debugInfo.step1_file_received = true;
        debugInfo.details.file = {
          name: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          userId: req.userId,
        };
      } else {
        debugInfo.errors.push("No file received in request");
        return res.json(debugInfo);
      }

      // Step 2: Test Supabase Storage Upload
      try {
        const { data: uploadData, error: uploadError } =
          await supabaseClient.storage
            .from("documents")
            .upload(`${req.userId}/${req.file.originalname}`, req.file.buffer);

        if (uploadError) {
          debugInfo.errors.push(
            `Supabase upload error: ${uploadError.message}`
          );
          debugInfo.details.supabase_error = uploadError;
        } else {
          debugInfo.step2_supabase_storage = true;
          debugInfo.details.supabase_upload = uploadData;
        }
      } catch (e) {
        debugInfo.errors.push(`Supabase upload exception: ${e.message}`);
      }

      // Step 3: Test TxAgent Reachability
      try {
        const healthResponse = await fetch(
          `${process.env.RUNPOD_EMBEDDING_URL}/health`
        );
        if (healthResponse.ok) {
          debugInfo.step3_txagent_reachable = true;
          debugInfo.details.txagent_health = await healthResponse.json();
        } else {
          debugInfo.errors.push(
            `TxAgent health check failed: ${healthResponse.status}`
          );
        }
      } catch (e) {
        debugInfo.errors.push(`TxAgent health check exception: ${e.message}`);
      }

      // Step 4: Test TxAgent Process Document (only if storage worked)
      if (
        debugInfo.step2_supabase_storage &&
        debugInfo.step3_txagent_reachable
      ) {
        try {
          const txAgentResponse = await fetch(
            `${process.env.RUNPOD_EMBEDDING_URL}/process-document`,
            {
              method: "POST",
              headers: {
                Authorization: req.headers.authorization,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                file_path: debugInfo.details.supabase_upload.path,
              }),
            }
          );

          if (txAgentResponse.ok) {
            debugInfo.step4_txagent_process = true;
            debugInfo.details.txagent_response = await txAgentResponse.json();
          } else {
            debugInfo.errors.push(
              `TxAgent process failed: ${txAgentResponse.status}`
            );
          }
        } catch (e) {
          debugInfo.errors.push(`TxAgent process exception: ${e.message}`);
        }
      }

      debugInfo.details.environment = {
        has_runpod_url: !!process.env.RUNPOD_EMBEDDING_URL,
        runpod_url: process.env.RUNPOD_EMBEDDING_URL,
        has_supabase_url: !!process.env.SUPABASE_URL,
      };

      res.json(debugInfo);
    } catch (error) {
      res.status(500).json({
        error: error.message,
        step1_file_received: false,
        step2_supabase_storage: false,
        step3_txagent_reachable: false,
        step4_txagent_process: false,
        errors: [error.message],
      });
    }
  });

  router.get("/job-status/:jobId", verifyToken, async (req, res) => {
    try {
      const { jobId } = req.params;

      const response = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/embedding-jobs/${jobId}`,
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get job status: ${response.status}`);
      }

      const jobStatus = await response.json();
      res.json(jobStatus);
    } catch (error) {
      errorLogger.error("Job status check failed", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// Legacy export for backward compatibility
export const documentsRouter = createDocumentsRouter;
