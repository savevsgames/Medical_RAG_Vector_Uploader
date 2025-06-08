import React from 'react';
import { X, Plus } from 'lucide-react';
import { Modal, Button } from '../ui';
import { FileSelector } from './FileSelector';
import { UploadProgress } from './UploadProgress';
import { useFileUpload } from './hooks/useFileUpload';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

export function UploadModal({ isOpen, onClose, onUploadComplete }: UploadModalProps) {
  const {
    uploads,
    isUploading,
    uploadFiles,
    clearUploads,
    getUploadStats
  } = useFileUpload();

  const stats = getUploadStats();
  const allCompleted = stats.total > 0 && stats.completed === stats.total;

  const handleClose = () => {
    if (isUploading) {
      return; // Prevent closing during upload
    }
    clearUploads();
    onClose();
  };

  const handleDone = () => {
    onUploadComplete();
    handleClose();
  };

  const footer = (
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500">
        {stats.total > 0 && (
          <span>
            {stats.completed} completed, {stats.failed} failed
          </span>
        )}
      </div>
      <div className="flex space-x-3">
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Close'}
        </Button>
        {allCompleted && (
          <Button onClick={handleDone}>
            Done
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Documents"
      size="lg"
      footer={footer}
    >
      <div className="p-6">
        <p className="text-gray-600 mb-6">
          Add medical documents for AI analysis
        </p>

        {uploads.length === 0 ? (
          <FileSelector onFilesSelected={uploadFiles} disabled={isUploading} />
        ) : (
          <>
            <UploadProgress uploads={uploads} />
            {!isUploading && (
              <div className="mt-4">
                <FileSelector
                  onFilesSelected={uploadFiles}
                  disabled={isUploading}
                  variant="compact"
                />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}