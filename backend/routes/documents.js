import express from "express";
import multer from "multer"; // ✅ ADD THIS LINE
import { v4 as uuidv4 } from "uuid";
import { upload } from "../middleware/upload.js";
import { verifyToken } from "../middleware/auth.js";
import { errorLogger } from "../agent_utils/shared/logger.js";

export function createDocumentsRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);

  // Simple upload route - let TxAgent handle all processing
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      errorLogger.info("Starting file upload", {
        filename: req.file.originalname,
        size: req.file.size,
        userId: req.userId,
        userEmail: req.userEmail || req.user?.email, // ✅ Better logging
      });

      // ✅ FIX: Build object key that starts with user ID (as suggested)
      const sanitizedFilename = req.file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, "_")
        .replace(/_{2,}/g, "_")
        .substring(0, 100);

      // ✅ CRITICAL: Path MUST start with userId/ for RLS policy to work
      const objectKey = `${req.userId}/${sanitizedFilename}`;

      errorLogger.debug("Upload path structure", {
        userId: req.userId,
        objectKey: objectKey,
        expectedFirstFolder: req.userId,
      });

      // ✅ Upload using your existing service role client with correct path
      const { data: uploadData, error: uploadError } =
        await supabaseClient.storage
          .from("documents")
          .upload(objectKey, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false, // Set to true if you want to allow overwrite
            metadata: {
              uploadedBy: req.userId,
              originalName: req.file.originalname,
              uploadTime: new Date().toISOString(),
            },
          });

      if (uploadError) {
        errorLogger.error("Supabase storage upload failed", {
          error_message: uploadError.message,
          error_code: uploadError.status,
          object_key: objectKey,
          user_id: req.userId,
          bucket: "documents",
          policy_check: `auth.uid()=${req.userId}, folder[1]=${req.userId}`,
        });
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      errorLogger.success("File uploaded to storage", {
        filePath: uploadData.path,
        fullPath: uploadData.fullPath,
        userId: req.userId,
        policyMatch: "userId matches folder structure",
      });

      // ✅ Continue with TxAgent processing...
      const txAgentResponse = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/process-document`,
        {
          method: "POST",
          headers: {
            Authorization: req.headers.authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_path: uploadData.path, // This will be: userId/filename
            metadata: {
              title: req.file.originalname,
              description: "User uploaded document",
              tags: ["medical", "user-upload"],
              user_id: req.userId,
            },
          }),
        }
      );

      if (!txAgentResponse.ok) {
        const errorText = await txAgentResponse.text();
        errorLogger.error("TxAgent processing failed", {
          status: txAgentResponse.status,
          error: errorText,
          file_path: uploadData.path,
        });
        throw new Error(`TxAgent processing failed: ${txAgentResponse.status}`);
      }

      const result = await txAgentResponse.json();

      errorLogger.success("Document processing started", {
        jobId: result.job_id,
        filePath: uploadData.path,
        userId: req.userId,
      });

      res.json({
        success: true,
        message: "Document uploaded and processing started",
        file_path: uploadData.path,
        job_id: result.job_id,
        status: result.status,
      });
    } catch (error) {
      errorLogger.error("Upload failed", {
        error: error.message,
        stack: error.stack,
        userId: req.userId,
      });

      // ✅ Handle multer errors properly
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "File too large. Maximum size is 50MB.",
          });
        }
      }

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
