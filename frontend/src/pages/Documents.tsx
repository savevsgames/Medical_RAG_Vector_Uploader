import React, { useState, useEffect } from "react";
import { FileText, Upload, Plus, TestTube } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api"; // ✅ Add centralized API client
import { useAuth } from "../contexts/AuthContext";
import { UploadModal } from "../components/upload";
import {
  DocumentCard,
  DocumentViewModal,
  DocumentEditModal,
} from "../components/documents";
import { Button, Input, Select, EmptyState } from "../components/ui";
import { PageLayout, StatsLayout } from "../components/layouts";
import { AsyncState } from "../components/feedback";
import { logger, logSupabaseOperation, logUserAction } from "../utils/logger";
import toast from "react-hot-toast";

interface Document {
  id: string;
  filename: string;
  content: string;
  metadata: {
    char_count: number;
    page_count?: number;
    file_size?: number;
    mime_type?: string;
    embedding_source?: string;
    processing_time_ms?: number;
    [key: string]: any;
  };
  created_at: string;
}

interface UploadStatus {
  job_id?: string;
  status?: string;
  message?: string;
  file_path?: string;
  poll_url?: string;
}

export function Documents() {
  const { user, session } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [testingEmbed, setTestingEmbed] = useState(false);

  // ✅ NEW: Upload tracking states
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewDocument, setViewDocument] = useState<Document | null>(null);
  const [editDocument, setEditDocument] = useState<Document | null>(null);

  // Debugging states
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // ✅ IMPROVED: Debug upload with proper error handling
  const debugUpload = async () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.docx,.txt,.md";

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setDebugLoading(true);
      setDebugResult(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        // ✅ Use centralized API client
        const response = await api.post("/debug-upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        setDebugResult(response.data);
        console.log("🔍 Debug Upload Result:", response.data);
        toast.success("Debug upload completed! Check console for details.");
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.error || error.message || "Debug upload failed";
        setDebugResult({ error: errorMessage });
        console.error("🔍 Debug Upload Error:", error);
        toast.error(`Debug upload failed: ${errorMessage}`);
      } finally {
        setDebugLoading(false);
      }
    };

    fileInput.click();
  };

  // ✅ IMPROVED: Fetch documents with better error handling
  const fetchDocuments = async () => {
    const userEmail = user?.email;

    logger.info("Fetching user documents", {
      component: "Documents",
      user: userEmail,
    });

    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        logSupabaseOperation("fetchDocuments", userEmail, "error", {
          error: error.message,
          code: error.code,
          details: error.details,
          component: "Documents",
        });
        throw error;
      }

      logSupabaseOperation("fetchDocuments", userEmail, "success", {
        documentsCount: data?.length || 0,
        component: "Documents",
      });

      setDocuments(data || []);
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to load documents";
      setError(errorMessage);
      logger.error("Failed to fetch documents", {
        component: "Documents",
        user: userEmail,
        error: errorMessage,
      });
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  // ✅ IMPROVED: Handle document deletion with API client
  const handleDeleteDocument = async (documentId: string) => {
    const userEmail = user?.email;

    try {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (error) {
        logSupabaseOperation("deleteDocument", userEmail, "error", {
          error: error.message,
          documentId,
          component: "Documents",
        });
        throw error;
      }

      logSupabaseOperation("deleteDocument", userEmail, "success", {
        documentId,
        component: "Documents",
      });

      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      toast.success("Document deleted successfully");
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to delete document";
      logger.error("Failed to delete document", {
        component: "Documents",
        user: userEmail,
        documentId,
        error: errorMessage,
      });
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleEditDocument = (updatedDocument: Document) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === updatedDocument.id ? updatedDocument : doc))
    );
    setEditDocument(null);
  };

  // ✅ NEW: Handle upload completion with job tracking
  const handleUploadComplete = (uploadResult?: UploadStatus) => {
    if (uploadResult) {
      setUploadStatus(uploadResult);

      // If we get a job_id, we can poll for status
      if (uploadResult.job_id) {
        toast.success(`Upload started! Job ID: ${uploadResult.job_id}`);
        // Optionally start polling for job status
        pollJobStatus(uploadResult.job_id);
      }
    }

    // Refresh documents list
    fetchDocuments();
  };

  // ✅ NEW: Poll job status
  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await api.get(`/api/documents/job-status/${jobId}`);
      const jobStatus = response.data;

      console.log(`Job ${jobId} status:`, jobStatus);

      // Update upload status
      setUploadStatus((prev) => (prev ? { ...prev, ...jobStatus } : jobStatus));

      // Continue polling if not complete
      if (jobStatus.status === "queued" || jobStatus.status === "processing") {
        setTimeout(() => pollJobStatus(jobId), 2000); // Poll every 2 seconds
      } else if (jobStatus.status === "completed") {
        toast.success("Document processing completed!");
        fetchDocuments(); // Refresh documents
      } else if (jobStatus.status === "failed") {
        toast.error("Document processing failed");
      }
    } catch (error: any) {
      console.error("Failed to poll job status:", error);
      // Don't spam user with polling errors
    }
  };

  // ✅ IMPROVED: Test embed endpoint with API client
  const testEmbedEndpoint = async () => {
    try {
      setTestingEmbed(true);

      // ✅ Use centralized API client
      const response = await api.post("/api/agent/test-health");

      console.log("🧪 Upload System Test Results:", response.data);
      toast.success("Upload system test completed! Check console for details.");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Test failed";
      console.error("🧪 Test Error:", error);
      toast.error(`Test failed: ${errorMessage}`);
    } finally {
      setTestingEmbed(false);
    }
  };

  // ✅ NEW: Handle upload error display
  const handleUploadError = (error: string) => {
    setUploadError(error);
    toast.error(error);
  };

  // Filter and search documents
  useEffect(() => {
    let filtered = documents;

    if (searchTerm) {
      filtered = filtered.filter(
        (doc) =>
          doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== "all") {
      filtered = filtered.filter((doc) => {
        const mimeType = doc.metadata.mime_type || "";
        switch (filterType) {
          case "pdf":
            return mimeType.includes("pdf");
          case "word":
            return mimeType.includes("word") || mimeType.includes("document");
          case "text":
            return mimeType.includes("text") || mimeType.includes("markdown");
          default:
            return true;
        }
      });
    }

    setFilteredDocuments(filtered);
  }, [documents, searchTerm, filterType]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const getDocumentStats = () => {
    const totalDocs = documents.length;
    const totalSize = documents.reduce(
      (sum, doc) => sum + (doc.metadata.file_size || 0),
      0
    );
    const totalChars = documents.reduce(
      (sum, doc) => sum + doc.metadata.char_count,
      0
    );

    return [
      {
        label: "Total Documents",
        value: totalDocs,
        icon: <FileText className="w-5 h-5" />,
        color: "healing-teal" as const,
      },
      {
        label: "Total Size",
        value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
        icon: <Upload className="w-5 h-5" />,
        color: "guardian-gold" as const,
      },
      {
        label: "Total Content",
        value: `${(totalChars / 1000).toFixed(0)}K chars`,
        icon: <FileText className="w-5 h-5" />,
        color: "healing-teal" as const,
      },
    ];
  };

  const filterOptions = [
    { value: "all", label: "All Types" },
    { value: "pdf", label: "PDF" },
    { value: "word", label: "Word" },
    { value: "text", label: "Text" },
  ];

  return (
    <PageLayout
      title="Document Library"
      subtitle="Manage your medical documents and embeddings"
      icon={<FileText className="w-6 h-6 text-healing-teal" />}
      actions={
        <div className="flex space-x-3">
          {/* Test System Button */}
          <Button
            variant="ghost"
            onClick={testEmbedEndpoint}
            loading={testingEmbed}
            icon={<TestTube className="w-5 h-5" />}
          >
            {testingEmbed ? "Testing..." : "Test System"}
          </Button>

          {/* Debug Upload Button */}
          <button
            onClick={debugUpload}
            disabled={debugLoading}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            {debugLoading ? "Testing Upload..." : "Debug Upload"}
          </button>

          {/* Upload Documents Button */}
          <Button
            onClick={() => setShowUploadModal(true)}
            icon={<Plus className="w-5 h-5" />}
          >
            Upload Documents
          </Button>
        </div>
      }
    >
      {/* Stats */}
      <StatsLayout stats={getDocumentStats()} columns={3} />

      {/* ✅ NEW: Upload Status Display */}
      {uploadStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-blue-800 mb-2">Upload Status</h4>
          <div className="text-sm text-blue-700">
            <p>
              <strong>Job ID:</strong> {uploadStatus.job_id}
            </p>
            <p>
              <strong>Status:</strong> {uploadStatus.status}
            </p>
            <p>
              <strong>File:</strong> {uploadStatus.file_path}
            </p>
            {uploadStatus.message && (
              <p>
                <strong>Message:</strong> {uploadStatus.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ✅ NEW: Upload Error Display */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-red-800 mb-2">Upload Error</h4>
          <p className="text-sm text-red-700">{uploadError}</p>
          <button
            onClick={() => setUploadError(null)}
            className="mt-2 text-xs text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-cloud-ivory rounded-2xl shadow-soft border border-soft-gray/20 p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />

            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              options={filterOptions}
            />
          </div>

          <Button variant="ghost" onClick={fetchDocuments}>
            Refresh
          </Button>
        </div>

        {/* Documents Grid */}
        <AsyncState
          loading={loading}
          error={error}
          onRetry={fetchDocuments}
          loadingText="Loading documents..."
        >
          {filteredDocuments.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-16 h-16" />}
              title={
                documents.length === 0
                  ? "No documents yet"
                  : "No documents match your search"
              }
              description={
                documents.length === 0
                  ? "Upload your first medical document to get started with AI analysis"
                  : "Try adjusting your search terms or filters"
              }
              action={
                documents.length === 0
                  ? {
                      label: "Upload Your First Document",
                      onClick: () => setShowUploadModal(true),
                      icon: <Upload className="w-5 h-5" />,
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDocuments.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onDelete={handleDeleteDocument}
                    onEdit={setEditDocument}
                    onView={setViewDocument}
                  />
                ))}
              </div>

              {/* Debug Results */}
              {debugResult && (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                  <h4 className="font-bold mb-2">Debug Upload Results:</h4>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(debugResult, null, 2)}
                  </pre>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-soft-gray/20 text-sm text-soft-gray text-center font-body">
                Showing {filteredDocuments.length} of {documents.length}{" "}
                documents
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
            </>
          )}
        </AsyncState>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
        onError={handleUploadError}
      />

      <DocumentViewModal
        document={viewDocument}
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
      />

      <DocumentEditModal
        document={editDocument}
        isOpen={!!editDocument}
        onClose={() => setEditDocument(null)}
        onSave={handleEditDocument}
      />
    </PageLayout>
  );
}
