import React, { useState, useEffect } from "react";
import { FileText, Upload, Plus, TestTube } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
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

export function Documents() {
  const { user, session } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [testingEmbed, setTestingEmbed] = useState(false);

  // Modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewDocument, setViewDocument] = useState<Document | null>(null);
  const [editDocument, setEditDocument] = useState<Document | null>(null);

  // Debugging states
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const debugUpload = async () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.docx,.txt,.md";

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setDebugLoading(true);
      setDebugResult(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/debug-upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: formData,
          }
        );

        const result = await response.json();
        setDebugResult(result);
        console.log("🔍 Debug Upload Result:", result);
      } catch (error) {
        setDebugResult({ error: error.message });
        console.error("🔍 Debug Upload Error:", error);
      } finally {
        setDebugLoading(false);
      }
    };

    fileInput.click();
  };

  const fetchDocuments = async () => {
    const userEmail = user?.email;

    logger.info("Fetching user documents", {
      component: "Documents",
      user: userEmail,
    });

    try {
      setError(null);
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load documents";
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
    } catch (error) {
      logger.error("Failed to delete document", {
        component: "Documents",
        user: userEmail,
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  const handleEditDocument = (updatedDocument: Document) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === updatedDocument.id ? updatedDocument : doc))
    );
    setEditDocument(null);
  };

  const handleUploadComplete = () => {
    fetchDocuments();
  };

  // FIXED: Test embed endpoint with proper response handling and debugging
  const testEmbedEndpoint = async () => {
    try {
      setTestingEmbed(true);

      // Change this URL to use your new test endpoint
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/test-upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();
      console.log("🧪 Upload System Test Results:", result);

      if (response.ok) {
        toast.success(
          "Upload system test completed! Check console for details."
        );
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
    } catch (error) {
      console.error("🧪 Test Error:", error);
      toast.error(`Test failed: ${error.message}`);
    } finally {
      setTestingEmbed(false);
    }
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
          {/* DIAGNOSTIC: Test Embed Button */}
          <Button
            variant="ghost"
            onClick={testEmbedEndpoint}
            loading={testingEmbed}
            icon={<TestTube className="w-5 h-5" />}
          >
            {testingEmbed ? "Testing..." : "Test Embed"}
          </Button>

          <button
            onClick={debugUpload}
            disabled={debugLoading}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            {debugLoading ? "Testing Upload..." : "Debug Upload Flow"}
          </button>

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

              {/* Results Info */}
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
