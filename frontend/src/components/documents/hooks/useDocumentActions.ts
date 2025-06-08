import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { logger, logUserAction } from '../../../utils/logger';
import toast from 'react-hot-toast';

export function useDocumentActions() {
  const { user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (
    documentId: string, 
    filename: string, 
    onDelete: (id: string) => void
  ) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(documentId);
      
      logUserAction('Document Deleted', user?.email, {
        documentId,
        filename,
        component: 'useDocumentActions'
      });
      
      toast.success('Document deleted successfully');
    } catch (error) {
      logger.error('Failed to delete document', {
        component: 'useDocumentActions',
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isDeleting,
    handleDelete
  };
}