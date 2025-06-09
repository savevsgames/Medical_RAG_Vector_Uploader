import React, { useState, useEffect } from 'react';
import { FileText, Upload, Plus, TestTube } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { UploadModal } from '../components/upload';
import { 
  DocumentCard, 
  DocumentViewModal, 
  DocumentEditModal 
} from '../components/documents';
import { Button, Input, Select, EmptyState } from '../components/ui';
import { PageLayout, StatsLayout } from '../components/layouts';
import { AsyncState } from '../components/feedback';
import { logger, logSupabaseOperation, logUserAction } from '../utils/logger';
import toast from 'react-hot-toast';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [testingEmbed, setTestingEmbed] = useState(false);
  
  // Modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewDocument, setViewDocument] = useState<Document | null>(null);
  const [editDocument, setEditDocument] = useState<Document | null>(null);

  const fetchDocuments = async () => {
    const userEmail = user?.email;
    
    logger.info('Fetching user documents', {
      component: 'Documents',
      user: userEmail
    });

    try {
      setError(null);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logSupabaseOperation('fetchDocuments', userEmail, 'error', {
          error: error.message,
          code: error.code,
          details: error.details,
          component: 'Documents'
        });
        throw error;
      }

      logSupabaseOperation('fetchDocuments', userEmail, 'success', {
        documentsCount: data?.length || 0,
        component: 'Documents'
      });

      setDocuments(data || []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load documents';
      setError(errorMessage);
      logger.error('Failed to fetch documents', {
        component: 'Documents',
        user: userEmail,
        error: errorMessage
      });
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    const userEmail = user?.email;
    
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) {
        logSupabaseOperation('deleteDocument', userEmail, 'error', {
          error: error.message,
          documentId,
          component: 'Documents'
        });
        throw error;
      }

      logSupabaseOperation('deleteDocument', userEmail, 'success', {
        documentId,
        component: 'Documents'
      });

      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
    } catch (error) {
      logger.error('Failed to delete document', {
        component: 'Documents',
        user: userEmail,
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  };

  const handleEditDocument = (updatedDocument: Document) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === updatedDocument.id ? updatedDocument : doc
    ));
    setEditDocument(null);
  };

  const handleUploadComplete = () => {
    fetchDocuments();
  };

  // DIAGNOSTIC: Test embed endpoint directly
  const testEmbedEndpoint = async () => {
    if (!session) {
      toast.error('No session available for testing');
      return;
    }

    setTestingEmbed(true);
    
    try {
      logger.info('Testing embed endpoint directly', {
        component: 'Documents',
        user: user?.email,
        apiUrl: import.meta.env.VITE_API_URL
      });

      const testPayload = {
        documentText: 'This is a test document for embedding generation. It contains medical terminology like cardiology, diagnosis, and treatment.',
        file_path: 'test-document.txt',
        metadata: {
          file_size: 128,
          mime_type: 'text/plain',
          test: true
        }
      };

      logger.debug('Test embed payload', {
        payload: testPayload,
        component: 'Documents'
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(testPayload)
      });

      logger.debug('Test embed response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        component: 'Documents'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Test embed request failed', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          component: 'Documents'
        });
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      logger.success('Test embed completed successfully', {
        responseData,
        component: 'Documents'
      });

      toast.success(`Embed test successful! Generated ${responseData.vector_dimensions || 'unknown'} dimensional embedding`);
      
      console.log('🧪 Test Embed Response:', responseData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Test embed failed', {
        error: errorMessage,
        component: 'Documents'
      });

      toast.error(`Embed test failed: ${errorMessage}`);
      console.error('🧪 Test Embed Error:', error);
    } finally {
      setTestingEmbed(false);
    }
  };

  // Filter and search documents
  useEffect(() => {
    let filtered = documents;

    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(doc => {
        const mimeType = doc.metadata.mime_type || '';
        switch (filterType) {
          case 'pdf':
            return mimeType.includes('pdf');
          case 'word':
            return mimeType.includes('word') || mimeType.includes('document');
          case 'text':
            return mimeType.includes('text') || mimeType.includes('markdown');
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
    const totalSize = documents.reduce((sum, doc) => sum + (doc.metadata.file_size || 0), 0);
    const totalChars = documents.reduce((sum, doc) => sum + doc.metadata.char_count, 0);
    
    return [
      {
        label: 'Total Documents',
        value: totalDocs,
        icon: <FileText className="w-5 h-5" />,
        color: 'blue' as const
      },
      {
        label: 'Total Size',
        value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
        icon: <Upload className="w-5 h-5" />,
        color: 'green' as const
      },
      {
        label: 'Total Content',
        value: `${(totalChars / 1000).toFixed(0)}K chars`,
        icon: <FileText className="w-5 h-5" />,
        color: 'purple' as const
      }
    ];
  };

  const filterOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'pdf', label: 'PDF' },
    { value: 'word', label: 'Word' },
    { value: 'text', label: 'Text' }
  ];

  return (
    <PageLayout
      title="Document Library"
      subtitle="Manage your medical documents and embeddings"
      icon={<FileText className="w-6 h-6 text-green-600" />}
      actions={
        <div className="flex space-x-3">
          {/* DIAGNOSTIC: Test Embed Button */}
          <Button
            variant="ghost"
            onClick={testEmbedEndpoint}
            loading={testingEmbed}
            icon={<TestTube className="w-5 h-5" />}
          >
            {testingEmbed ? 'Testing...' : 'Test Embed'}
          </Button>
          
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
      <div className="bg-white rounded-lg shadow p-6">
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

          <Button
            variant="ghost"
            onClick={fetchDocuments}
          >
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
              title={documents.length === 0 ? 'No documents yet' : 'No documents match your search'}
              description={
                documents.length === 0 
                  ? 'Upload your first medical document to get started with AI analysis'
                  : 'Try adjusting your search terms or filters'
              }
              action={documents.length === 0 ? {
                label: 'Upload Your First Document',
                onClick: () => setShowUploadModal(true),
                icon: <Upload className="w-5 h-5" />
              } : undefined}
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
              <div className="mt-6 pt-6 border-t border-gray-200 text-sm text-gray-500 text-center">
                Showing {filteredDocuments.length} of {documents.length} documents
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