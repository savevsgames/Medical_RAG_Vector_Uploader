import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { supabase } from '../lib/supabaseClient';
import { logger, logSupabaseOperation, logUserAction } from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
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

interface DocumentFilters {
  searchTerm?: string;
  filterType?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useDocuments() {
  const { apiCall } = useApi();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DocumentFilters>({
    searchTerm: '',
    filterType: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  const fetchDocuments = useCallback(async () => {
    const userEmail = user?.email;
    
    logger.info('Fetching user documents', {
      component: 'useDocuments',
      user: userEmail
    });

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order(filters.sortBy || 'created_at', { ascending: filters.sortOrder === 'asc' });

      if (error) {
        logSupabaseOperation('fetchDocuments', userEmail, 'error', {
          error: error.message,
          code: error.code,
          details: error.details,
          component: 'useDocuments'
        });
        throw error;
      }

      logSupabaseOperation('fetchDocuments', userEmail, 'success', {
        documentsCount: data?.length || 0,
        component: 'useDocuments'
      });

      setDocuments(data || []);
    } catch (error) {
      logger.error('Failed to fetch documents', {
        component: 'useDocuments',
        user: userEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to load documents');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, filters.sortBy, filters.sortOrder]);

  const deleteDocument = useCallback(async (documentId: string) => {
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
          component: 'useDocuments'
        });
        throw error;
      }

      logSupabaseOperation('deleteDocument', userEmail, 'success', {
        documentId,
        component: 'useDocuments'
      });

      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      logUserAction('Document Deleted', userEmail, {
        documentId,
        component: 'useDocuments'
      });

    } catch (error) {
      logger.error('Failed to delete document', {
        component: 'useDocuments',
        user: userEmail,
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [user]);

  const updateDocument = useCallback(async (documentId: string, updates: Partial<Document>) => {
    const userEmail = user?.email;
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', documentId)
        .select()
        .single();

      if (error) {
        logSupabaseOperation('updateDocument', userEmail, 'error', {
          error: error.message,
          documentId,
          component: 'useDocuments'
        });
        throw error;
      }

      logSupabaseOperation('updateDocument', userEmail, 'success', {
        documentId,
        component: 'useDocuments'
      });

      // Update local state
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId ? { ...doc, ...updates } : doc
      ));

      logUserAction('Document Updated', userEmail, {
        documentId,
        component: 'useDocuments'
      });

      return data;

    } catch (error) {
      logger.error('Failed to update document', {
        component: 'useDocuments',
        user: userEmail,
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [user]);

  // Filter documents based on current filters
  useEffect(() => {
    let filtered = documents;

    // Apply search filter
    if (filters.searchTerm) {
      filtered = filtered.filter(doc => 
        doc.filename.toLowerCase().includes(filters.searchTerm!.toLowerCase()) ||
        doc.content.toLowerCase().includes(filters.searchTerm!.toLowerCase())
      );
    }

    // Apply type filter
    if (filters.filterType && filters.filterType !== 'all') {
      filtered = filtered.filter(doc => {
        const mimeType = doc.metadata.mime_type || '';
        switch (filters.filterType) {
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
  }, [documents, filters]);

  // Fetch documents on mount and when filters change
  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [fetchDocuments, user]);

  const getDocumentStats = useCallback(() => {
    const totalDocs = documents.length;
    const totalSize = documents.reduce((sum, doc) => sum + (doc.metadata.file_size || 0), 0);
    const totalChars = documents.reduce((sum, doc) => sum + doc.metadata.char_count, 0);
    
    return { totalDocs, totalSize, totalChars };
  }, [documents]);

  return {
    documents,
    filteredDocuments,
    loading,
    filters,
    setFilters,
    fetchDocuments,
    deleteDocument,
    updateDocument,
    getDocumentStats
  };
}