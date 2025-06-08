import React, { useState } from 'react';
import { MoreVertical, Eye, Edit3, Copy, Trash2 } from 'lucide-react';
import { Button } from '../ui';

interface Document {
  id: string;
  filename: string;
  content: string;
  metadata: any;
  created_at: string;
}

interface DocumentActionsProps {
  document: Document;
  onView: (document: Document) => void;
  onEdit: (document: Document) => void;
  onDelete: () => void;
  isDeleting: boolean;
}

export function DocumentActions({ 
  document, 
  onView, 
  onEdit, 
  onDelete, 
  isDeleting 
}: DocumentActionsProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(document.id);
    setShowMenu(false);
  };

  const actions = [
    {
      label: 'View Content',
      icon: Eye,
      onClick: () => {
        onView(document);
        setShowMenu(false);
      }
    },
    {
      label: 'Edit Metadata',
      icon: Edit3,
      onClick: () => {
        onEdit(document);
        setShowMenu(false);
      }
    },
    {
      label: 'Copy ID',
      icon: Copy,
      onClick: handleCopyId
    },
    {
      label: isDeleting ? 'Deleting...' : 'Delete',
      icon: Trash2,
      onClick: onDelete,
      disabled: isDeleting,
      variant: 'danger' as const
    }
  ];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowMenu(!showMenu)}
        disabled={isDeleting}
        icon={<MoreVertical className="w-4 h-4" />}
      />

      {showMenu && (
        <>
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
            {actions.map((action, index) => (
              <React.Fragment key={action.label}>
                {index === actions.length - 1 && (
                  <div className="border-t border-gray-100" />
                )}
                <button
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`w-full flex items-center px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
                    action.variant === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <action.icon className="w-4 h-4 mr-2" />
                  {action.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          
          <div
            className="fixed inset-0 z-0"
            onClick={() => setShowMenu(false)}
          />
        </>
      )}
    </div>
  );
}