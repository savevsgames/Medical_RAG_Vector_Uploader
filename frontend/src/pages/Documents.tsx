import React, { useState, useEffect } from 'react';
import { FileText, Upload, Search, Filter, RefreshCw, Plus, Grid, List } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { UploadModal } from '../components/UploadModal';
import { DocumentCard } from '../components/DocumentCard';
import { DocumentViewModal } from '../components/DocumentViewModal';
import { DocumentEditModal } from '../components/DocumentEditModal';
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
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
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
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order(sortBy, { ascending: sortOrder === 'asc' });

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
      logger.error('Failed to fetch documents', {
        component: 'Documents',
        user: userEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
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

      // Update local state
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
  };

  const handleUploadComplete = () => {
    fetchDocuments();
  };

  // Filter and search documents
  useEffect(() => {
    let filtered = documents;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply type filter
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
  }, [user, sortBy, sortOrder]);

  const getDocumentStats = () => {
    const totalDocs = documents.length;
    const totalSize = documents.reduce((sum, doc) => sum + (doc.metadata.file_size || 0), 0);
    const totalChars = documents.reduce((sum, doc) => sum + doc.metadata.char_count, 0);
    
    return { totalDocs, totalSize, totalChars };
  };

  const stats = getDocumentStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
              <p className="text-gray-600">Manage your medical documents and embeddings</p>
            </div>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Upload Documents</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Total Documents</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalDocs}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Upload className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">Total Size</span>
            </div>
            <p className="text-2xl font-bold text-green-900 mt-1">
              {(stats.totalSize / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Search className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">Total Content</span>
            </div>
            <p className="text-2xl font-bold text-purple-900 mt-1">
              {(stats.totalChars / 1000).toFixed(0)}K chars
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="pdf">PDF</option>
              <option value="word">Word</option>
              <option value="text">Text</option>
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="created_at-desc">Newest First</option>
              <option value="created_at-asc">Oldest First</option>
              <option value="filename-asc">Name A-Z</option>
              <option value="filename-desc">Name Z-A</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchDocuments}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Documents Grid/List */}
      <div className="bg-white rounded-lg shadow p-6">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {documents.length === 0 ? 'No documents yet' : 'No documents match your search'}
            </h3>
            <p className="text-gray-500 mb-6">
              {documents.length === 0 
                ? 'Upload your first medical document to get started with AI analysis'
                : 'Try adjusting your search terms or filters'
              }
            </p>
            {documents.length === 0 && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors mx-auto"
              >
                <Upload className="w-5 h-5" />
                <span>Upload Your First Document</span>
              </button>
            )}
          </div>
        ) : (
          <div className={
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }>
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
        )}

        {/* Results Info */}
        {filteredDocuments.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 text-sm text-gray-500 text-center">
            Showing {filteredDocuments.length} of {documents.length} documents
            {searchTerm && ` matching "${searchTerm}"`}
          </div>
        )}
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
    </div>
  );
}