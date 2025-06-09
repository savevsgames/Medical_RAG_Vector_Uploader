import React, { useState } from 'react';
import { X, Upload, Plus, FileText } from 'lucide-react';
import { useUpload } from '../../hooks/useUpload';
import { UploadProgress } from './UploadProgress';
import { FileSelector } from './FileSelector';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

export function UploadModal({ isOpen, onClose, onUploadComplete }: UploadModalProps) {
  const { uploads, isUploading, uploadFiles, clearUploads, getUploadStats } = useUpload();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileSelect = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      await uploadFiles(selectedFiles);
      
      // Check if all uploads completed successfully
      const stats = getUploadStats();
      if (stats.completed > 0 && stats.failed === 0) {
        onUploadComplete();
        setTimeout(() => {
          handleClose();
        }, 2000); // Auto-close after 2 seconds if all successful
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFiles([]);
      clearUploads();
      onClose();
    }
  };

  const handleAddMoreFiles = () => {
    setSelectedFiles([]);
  };

  const stats = getUploadStats();
  const hasUploads = uploads.length > 0;
  const allCompleted = stats.total > 0 && stats.inProgress === 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-cloud-ivory rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-soft-gray/20">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-healing-teal/10 rounded-xl">
              <Upload className="w-6 h-6 text-healing-teal" />
            </div>
            <div>
              <h2 className="text-xl font-heading font-bold text-deep-midnight">Upload Documents</h2>
              <p className="text-sm text-soft-gray font-body">Add medical documents for AI analysis</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 hover:bg-soft-gray/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5 text-soft-gray" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Upload Progress Section */}
          {hasUploads && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-heading font-semibold text-deep-midnight">Upload Progress</h3>
                <div className="text-sm text-soft-gray font-body">
                  {stats.completed} of {stats.total} completed
                </div>
              </div>
              
              <UploadProgress uploads={uploads} />
              
              {/* Overall Progress Summary */}
              <div className="mt-4 p-4 bg-sky-blue/20 rounded-xl">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex space-x-4">
                    {stats.completed > 0 && (
                      <span className="text-healing-teal font-subheading font-medium">
                        ✅ {stats.completed} completed
                      </span>
                    )}
                    {stats.inProgress > 0 && (
                      <span className="text-guardian-gold font-subheading font-medium">
                        ⏳ {stats.inProgress} in progress
                      </span>
                    )}
                    {stats.failed > 0 && (
                      <span className="text-red-600 font-subheading font-medium">
                        ❌ {stats.failed} failed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* File Selection Section */}
          {(!hasUploads || allCompleted) && (
            <div>
              <h3 className="text-lg font-heading font-semibold text-deep-midnight mb-4">
                {hasUploads ? 'Add More Files' : 'Select Files'}
              </h3>
              
              <FileSelector
                onFileSelect={handleFileSelect}
                selectedFiles={selectedFiles}
                disabled={isUploading}
              />

              {selectedFiles.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-subheading font-medium text-deep-midnight mb-2">
                    Selected Files ({selectedFiles.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-sky-blue/10 rounded-xl">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-4 h-4 text-healing-teal" />
                          <div>
                            <p className="text-sm font-body font-medium text-deep-midnight">{file.name}</p>
                            <p className="text-xs text-soft-gray font-body">
                              {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Unknown type'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                          disabled={isUploading}
                          className="p-1 hover:bg-soft-gray/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4 text-soft-gray" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* In-Progress Section */}
          {hasUploads && !allCompleted && (
            <div className="text-center py-4">
              <div className="inline-flex items-center space-x-2 text-healing-teal">
                <div className="w-4 h-4 border-2 border-healing-teal border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-body">Processing your documents...</span>
              </div>
              <p className="text-xs text-soft-gray mt-2 font-body">
                Please wait while we extract text and generate embeddings
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-soft-gray/20 bg-sky-blue/5">
          <div className="text-sm text-soft-gray font-body">
            {hasUploads ? (
              <span>
                {stats.total} file{stats.total !== 1 ? 's' : ''} • 
                {stats.completed} completed • 
                {stats.failed} failed
              </span>
            ) : (
              <span>Supported: PDF, DOCX, TXT, MD</span>
            )}
          </div>
          
          <div className="flex space-x-3">
            {allCompleted && stats.failed === 0 && (
              <button
                onClick={handleAddMoreFiles}
                className="flex items-center px-4 py-2 text-sm font-subheading font-medium text-healing-teal bg-healing-teal/10 rounded-xl hover:bg-healing-teal/20 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add More
              </button>
            )}
            
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="px-4 py-2 text-sm font-subheading font-medium text-soft-gray bg-cloud-ivory border border-soft-gray/30 rounded-xl hover:bg-soft-gray/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Close'}
            </button>
            
            {selectedFiles.length > 0 && !isUploading && (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex items-center px-4 py-2 text-sm font-subheading font-medium text-cloud-ivory bg-healing-teal rounded-xl hover:bg-healing-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}