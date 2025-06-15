import { useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  logger,
  logUserAction,
  logApiCall,
  logFileOperation,
} from "../utils/logger";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

interface UploadProgress {
  file: File;
  status: "uploading" | "processing" | "completed" | "error";
  progress: number;
  message: string;
  documentId?: string;
  error?: string;
}

export function useUpload() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateUploadProgress = useCallback(
    (fileIndex: number, updates: Partial<UploadProgress>) => {
      setUploads((prev) =>
        prev.map((upload, index) =>
          index === fileIndex ? { ...upload, ...updates } : upload
        )
      );

      // ENHANCED: Log progress updates for debugging
      logger.debug("Upload progress updated", {
        fileIndex,
        updates,
        component: "useUpload",
      });
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File, fileIndex: number) => {
      const userEmail = user?.email;

      try {
        updateUploadProgress(fileIndex, {
          status: "uploading",
          progress: 10,
          message: "Preparing upload...",
        });

        logFileOperation("Upload Started", file.name, userEmail, {
          fileSize: file.size,
          fileType: file.type,
          component: "useUpload",
        });

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          throw new Error("Authentication required");
        }

        updateUploadProgress(fileIndex, {
          progress: 25,
          message: "Uploading to server...",
        });

        const formData = new FormData();
        formData.append("file", file);

        const apiUrl = `${import.meta.env.VITE_API_URL}/upload`;

        logApiCall("/upload", "POST", userEmail, "initiated", {
          fileName: file.name,
          fileSize: file.size,
          component: "useUpload",
        });

        const response = await fetch(apiUrl, {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const uploadResult = await response.json();

        updateUploadProgress(fileIndex, {
          progress: 50,
          message: "File uploaded, processing started...",
        });

        // If we got a job_id, monitor the processing
        if (uploadResult.job_id) {
          await monitorJobProgress(uploadResult.job_id, fileIndex);
        } else {
          // Legacy response format - mark as complete
          updateUploadProgress(fileIndex, {
            status: "completed",
            progress: 100,
            message: "Upload completed!",
            documentId: uploadResult.document_id,
          });
        }

        logFileOperation("Upload Completed", file.name, userEmail, {
          documentId: uploadResult.document_id || uploadResult.job_id,
          component: "useUpload",
        });

        return uploadResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown upload error";

        updateUploadProgress(fileIndex, {
          status: "error",
          progress: 0,
          message: "Upload failed",
          error: errorMessage,
        });

        logFileOperation("Upload Failed", file.name, userEmail, {
          error: errorMessage,
          component: "useUpload",
        });

        throw error;
      }
    },
    [user, updateUploadProgress]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (isUploading) return;

      const userEmail = user?.email;

      // ENHANCED: Log multiple files upload initiation
      logger.debug("Multiple files upload initiated", {
        fileCount: files.length,
        fileNames: files.map((f) => f.name),
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        component: "useUpload",
      });

      logUserAction("Multiple Files Upload Initiated", userEmail, {
        fileCount: files.length,
        fileNames: files.map((f) => f.name),
        component: "useUpload",
      });

      setIsUploading(true);

      // Initialize upload progress for all files
      const initialUploads: UploadProgress[] = files.map((file) => ({
        file,
        status: "uploading" as const,
        progress: 0,
        message: "Queued for upload...",
      }));

      setUploads(initialUploads);

      const results = [];

      // Upload files sequentially to avoid overwhelming the server
      for (let i = 0; i < files.length; i++) {
        try {
          logger.debug("Processing file in sequence", {
            fileIndex: i,
            fileName: files[i].name,
            component: "useUpload",
          });

          const result = await uploadFile(files[i], i);
          results.push(result);
        } catch (error) {
          logger.error("File upload failed in sequence", {
            fileIndex: i,
            fileName: files[i].name,
            user: userEmail,
            error: error instanceof Error ? error.message : "Unknown error",
            component: "useUpload",
          });
        }
      }

      setIsUploading(false);

      // ENHANCED: Log final upload results
      logger.debug("Multiple files upload completed", {
        totalFiles: files.length,
        successfulUploads: results.length,
        failedUploads: files.length - results.length,
        component: "useUpload",
      });

      return results;
    },
    [isUploading, user, uploadFile]
  );

  const clearUploads = useCallback(() => {
    logger.debug("Clearing upload history", {
      previousUploadCount: uploads.length,
      component: "useUpload",
    });
    setUploads([]);
  }, [uploads.length]);

  const getUploadStats = useCallback(() => {
    const total = uploads.length;
    const completed = uploads.filter((u) => u.status === "completed").length;
    const failed = uploads.filter((u) => u.status === "error").length;
    const inProgress = uploads.filter(
      (u) => u.status === "uploading" || u.status === "processing"
    ).length;

    return { total, completed, failed, inProgress };
  }, [uploads]);

  // Add this function to your useUpload hook
  const monitorJobProgress = useCallback(
    async (jobId: string, fileIndex: number) => {
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (attempts < maxAttempts) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const response = await fetch(
            `${import.meta.env.VITE_API_URL}/job-status/${jobId}`,
            {
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
              },
            }
          );

          if (!response.ok) {
            throw new Error("Failed to check job status");
          }

          const jobStatus = await response.json();

          switch (jobStatus.status) {
            case "pending":
              updateUploadProgress(fileIndex, {
                progress: 60,
                message: "Queued for processing...",
              });
              break;

            case "processing":
              updateUploadProgress(fileIndex, {
                progress: 80,
                message: "Processing document and generating embeddings...",
              });
              break;

            case "completed":
              updateUploadProgress(fileIndex, {
                status: "completed",
                progress: 100,
                message: `Processing complete! ${
                  jobStatus.chunk_count || 0
                } chunks created.`,
                documentId: jobStatus.job_id,
              });
              return jobStatus;

            case "failed":
              throw new Error(jobStatus.error || "Processing failed");

            default:
              updateUploadProgress(fileIndex, {
                progress: 70,
                message: `Status: ${jobStatus.status}`,
              });
          }

          // Wait 5 seconds before checking again
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        } catch (error) {
          console.error("Job monitoring error:", error);
          throw error;
        }
      }

      throw new Error("Processing timeout - job took too long");
    },
    [updateUploadProgress]
  );

  return {
    uploads,
    isUploading,
    uploadFiles,
    clearUploads,
    getUploadStats,
  };
}
