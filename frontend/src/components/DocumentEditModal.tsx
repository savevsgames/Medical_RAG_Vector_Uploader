import React, { useState, useEffect } from 'react';
import { X, Save, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { logger, logUserAction } from '../utils/logger';

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
    title?: string;
    chunk_index?: number;
    total_chunks?: number;
    [key: string]: any;
  };
  created_at: string;
}

interface DocumentEditModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedDocument: Document) => void;
}

// Helper function to create a user-friendly display name
const getDocumentDisplayName = (document: Document): string => {
  const { metadata, filename } = document;
  
  // Extract title from metadata, fallback to filename
  const baseTitle = metadata.title || filename || 'Untitled Document';
  
  // If we have chunk information, add it to the display name
  if (metadata.chunk_index !== undefined && metadata.total_chunks !== undefined) {
    // Convert 0-based index to 1-based for user display
    const chunkNumber = metadata.chunk_index + 1;
    return `${baseTitle} (Chunk ${chunkNumber}/${metadata.total_chunks})`;
  }
  
  return baseTitle;
};

export function DocumentEditModal({ document, isOpen, onClose, onSave }: DocumentEditModalProps) {
  const [filename, setFilename] = useState('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [customMetadata, setCustomMetadata] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (document) {
      setFilename(document.filename);
      
      // Separate system metadata from custom metadata
      const systemKeys = ['char_count', 'page_count', 'file_size', 'mime_type', 'embedding_source', 'processing_time_ms', 'title', 'chunk_index', 'total_chunks'];
      const customMeta = Object.entries(document.metadata)
        .filter(([key]) => !systemKeys.includes(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
      setMetadata(document.metadata);
      setCustomMetadata(JSON.stringify(customMeta, null, 2));
    }
  }, [document]);

  const handleSave = async () => {
    if (!document) return;

    setIsSaving(true);
    try {
      // Parse custom metadata
      let parsedCustomMetadata = {};
      if (customMetadata.trim()) {
        try {
          parsedCustomMetadata = JSON.parse(customMetadata);
        } catch (error) {
          toast.error('Invalid JSON in custom metadata');
          setIsSaving(false);
          return;
        }
      }

      // Merge system metadata with custom metadata
      const systemKeys = ['char_count', 'page_count', 'file_size', 'mime_type', 'embedding_source', 'processing_time_ms', 'title', 'chunk_index', 'total_chunks'];
      const systemMetadata = Object.entries(metadata)
        .filter(([key]) => systemKeys.includes(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      const updatedMetadata = {
        ...systemMetadata,
        ...parsedCustomMetadata
      };

      // Update in Supabase
      const { data, error } = await supabase
        .from('documents')
        .update({
          filename: filename,
          metadata: updatedMetadata
        })
        .eq('id', document.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const updatedDocument = {
        ...document,
        filename: filename,
        metadata: updatedMetadata
      };

      logUserAction('Document Updated', null, {
        documentId: document.id,
        oldFilename: document.filename,
        newFilename: filename,
        displayName: getDocumentDisplayName(updatedDocument),
        component: 'DocumentEditModal'
      });

      onSave(updatedDocument);
      toast.success('Document updated successfully');
      onClose();

    } catch (error) {
      logger.error('Failed to update document', {
        component: 'DocumentEditModal',
        documentId: document?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to update document');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !document) return null;

  // Get the display name for this document
  const displayName = getDocumentDisplayName(document);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Edit Document</h2>
              <p className="text-sm text-gray-500">Update document information and metadata</p>
              <p className="text-xs text-blue-600 mt-1">Current: {displayName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* Filename */}
          <div>
            <label htmlFor="filename" className="block text-sm font-medium text-gray-700 mb-2">
              Filename
            </label>
            <input
              type="text"
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter filename"
            />
          </div>

          {/* System Metadata (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              System Metadata (Read-only)
            </label>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Characters:</span>
                  <span className="ml-2 font-medium">{(metadata.char_count || 0).toLocaleString()}</span>
                </div>
                {metadata.page_count && (
                  <div>
                    <span className="text-gray-500">Pages:</span>
                    <span className="ml-2 font-medium">{metadata.page_count}</span>
                  </div>
                )}
                {metadata.file_size && (
                  <div>
                    <span className="text-gray-500">File Size:</span>
                    <span className="ml-2 font-medium">
                      {(metadata.file_size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                )}
                {metadata.mime_type && (
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className="ml-2 font-medium">{metadata.mime_type}</span>
                  </div>
                )}
                {metadata.embedding_source && (
                  <div>
                    <span className="text-gray-500">Embedding:</span>
                    <span className="ml-2 font-medium">{metadata.embedding_source}</span>
                  </div>
                )}
                {metadata.processing_time_ms && (
                  <div>
                    <span className="text-gray-500">Processing Time:</span>
                    <span className="ml-2 font-medium">{metadata.processing_time_ms}ms</span>
                  </div>
                )}
              </div>
              
              {/* Chunk Information */}
              {metadata.chunk_index !== undefined && metadata.total_chunks !== undefined && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-800 font-medium">Document Chunk</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {metadata.chunk_index + 1}/{metadata.total_chunks}
                      </span>
                    </div>
                    {metadata.title && (
                      <div className="mt-1">
                        <span className="text-blue-600">Original File:</span>
                        <span className="ml-2 font-medium text-blue-800">{metadata.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Custom Metadata */}
          <div>
            <label htmlFor="custom-metadata" className="block text-sm font-medium text-gray-700 mb-2">
              Custom Metadata (JSON)
            </label>
            <textarea
              id="custom-metadata"
              value={customMetadata}
              onChange={(e) => setCustomMetadata(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder='{\n  "category": "cardiology",\n  "author": "Dr. Smith",\n  "tags": ["research", "clinical"]\n}'
            />
            <p className="mt-1 text-xs text-gray-500">
              Add custom metadata as JSON. This will be merged with system metadata.
            </p>
          </div>

          {/* Document Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Document Information</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div>ID: <span className="font-mono">{document.id}</span></div>
              <div>Created: {new Date(document.created_at).toLocaleString()}</div>
              <div>Content Length: {(document.content || '').length.toLocaleString()} characters</div>
              <div>Display Name: <span className="font-medium">{displayName}</span></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !filename.trim()}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}