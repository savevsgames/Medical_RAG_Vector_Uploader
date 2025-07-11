import express from "express";
import multer from "multer"; // ✅ ADD THIS LINE
import { v4 as uuidv4 } from "uuid";
import { upload } from "../middleware/upload.js";
import { verifyToken } from "../middleware/auth.js";
import { errorLogger } from "../agent_utils/shared/logger.js";
import { createClient } from "@supabase/supabase-js";

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

      // ✅ CRITICAL FIX: Object key MUST start with userId/
      const sanitizedFilename = req.file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, "_")
        .replace(/_{2,}/g, "_")
        .substring(0, 100);

      // ✅ This is the key fix - ensure userId is the first folder
      const objectKey = `${req.userId}/${Date.now()}_${sanitizedFilename}`;

      // ✅ Debug logging to verify the structure
      errorLogger.debug("Object key structure check", {
        objectKey: objectKey,
        expectedUserId: req.userId,
        actualFirstFolder: objectKey.split("/")[0],
        structureMatch: objectKey.split("/")[0] === req.userId,
        policyWillMatch: `auth.uid()::text (${
          req.userId
        }) = storage.foldername(${objectKey})[1] (${objectKey.split("/")[0]})`,
      });

      // Add this right before the storage upload call:
      console.log("🔍 DEBUG Object Key Structure:");
      console.log("  Object Key:", objectKey);
      console.log("  Expected UID:", req.userId);
      console.log("  First Folder:", objectKey.split("/")[0]);
      console.log("  Match:", objectKey.split("/")[0] === req.userId);
      console.log("  Policy Check: auth.uid()::text =", req.userId);
      console.log(
        "  Policy Check: storage.foldername(name)[1] =",
        objectKey.split("/")[0]
      );

      // ✅ FIX: Create user-authenticated client for storage upload
      const userSupabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY, // Use anon key, not service key
        {
          global: {
            headers: {
              Authorization: req.headers.authorization, // User's JWT
            },
          },
        }
      );

      errorLogger.debug("Using user-authenticated client for storage", {
        userId: req.userId,
        authMethod: "user_jwt",
        clientType: "user_context",
      });

      // ✅ Upload with user context (now auth.uid() will work)
      const { data: uploadData, error: uploadError } =
        await userSupabaseClient.storage
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
          auth_context: "user_jwt",
          rls_check: {
            auth_uid: req.userId,
            folder_structure: objectKey.split("/"),
            first_folder: objectKey.split("/")[0],
            policy_match: objectKey.split("/")[0] === req.userId,
          },
        });
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      errorLogger.success("File uploaded to storage", {
        filePath: uploadData.path,
        objectKey: objectKey,
        userId: req.userId,
        authContext: "user_jwt",
        rlsPolicyMatch: "✅ auth.uid() matches first folder",
      });

      // ✅ Use service role client for database operations (if needed)
      // Continue with TxAgent processing using original supabaseClient...
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

      // Optional: Add job_id to response for better debugging
      res.json({
        success: true,
        message: "Document uploaded and processing started",
        file_path: uploadData.path,
        job_id: result.job_id, // ✅ Make sure this is returned
        status: result.status,
        // ✅ Add debug info
        debug: {
          object_key: objectKey,
          user_id: req.userId,
          txagent_response: result,
        },
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

  // ✅ FIXED: Job status endpoint - query Supabase directly instead of TxAgent
  router.get("/job-status/:jobId", verifyToken, async (req, res) => {
    try {
      const { jobId } = req.params;
      const userId = req.userId;

      errorLogger.info("Fetching job status from database", {
        jobId,
        userId,
        component: "Documents"
      });

      // Query the embedding_jobs table directly from Supabase
      const { data, error } = await supabaseClient
        .from("embedding_jobs")
        .select("id, status, chunk_count, error, created_at, updated_at, metadata")
        .eq("id", jobId)
        .eq("user_id", userId) // Ensure user can only access their own jobs
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - job not found or user doesn't have access
          errorLogger.warn("Job not found or access denied", {
            jobId,
            userId,
            error: error.message,
            component: "Documents"
          });
          return res.status(404).json({ 
            error: "Job not found or access denied",
            job_id: jobId
          });
        }
        
        errorLogger.error("Database error fetching job status", {
          jobId,
          userId,
          error: error.message,
          code: error.code,
          component: "Documents"
        });
        throw error;
      }

      errorLogger.success("Job status retrieved successfully", {
        jobId,
        userId,
        status: data.status,
        chunkCount: data.chunk_count,
        component: "Documents"
      });

      // Return the job status
      res.json({
        job_id: data.id,
        status: data.status,
        chunk_count: data.chunk_count || 0,
        error: data.error,
        created_at: data.created_at,
        updated_at: data.updated_at,
        metadata: data.metadata || {}
      });

    } catch (error) {
      const errorMessage = error?.message || "Failed to get job status";
      
      errorLogger.error("Job status check failed", {
        jobId: req.params.jobId,
        userId: req.userId,
        error: errorMessage,
        component: "Documents"
      });
      
      res.status(500).json({ 
        error: "Failed to get job status",
        details: errorMessage,
        job_id: req.params.jobId
      });
    }
  });

  return router;
}

// Legacy export for backward compatibility
export const documentsRouter = createDocumentsRouter;