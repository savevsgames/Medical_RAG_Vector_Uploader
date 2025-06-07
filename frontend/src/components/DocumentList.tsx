import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { logger, logSupabaseOperation } from '../utils/logger';

interface Document {
  id: string;
  filename: string;
  metadata: {
    char_count: number;
    page_count?: number;
  };
  created_at: string;
}

export function DocumentList() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocuments() {
      const userEmail = user?.email;
      
      logger.info('Fetching user documents', {
        component: 'DocumentList',
        user: userEmail
      });

      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          logSupabaseOperation('fetchDocuments', userEmail, 'error', {
            error: error.message,
            code: error.code,
            details: error.details,
            component: 'DocumentList'
          });
          throw error;
        }

        logSupabaseOperation('fetchDocuments', userEmail, 'success', {
          documentsCount: data?.length || 0,
          component: 'DocumentList'
        });

        setDocuments(data || []);
      } catch (error) {
        logger.error('Failed to fetch documents', {
          component: 'DocumentList',
          user: userEmail,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error('Error fetching documents:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchDocuments();
    } else {
      logger.warn('No user found, skipping document fetch', {
        component: 'DocumentList'
      });
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    logger.debug('DocumentList loading state', {
      component: 'DocumentList',
      user: user?.email
    });
    return <div className="text-center py-8">Loading documents...</div>;
  }

  if (documents.length === 0) {
    logger.info('No documents found for user', {
      component: 'DocumentList',
      user: user?.email
    });
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Your Documents</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Filename
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Uploaded
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {doc.filename}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {doc.metadata.char_count.toLocaleString()} chars
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(doc.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}