import React from 'react';
import { Upload } from 'lucide-react';
import { FileUpload } from '../ui';

interface FileSelectorProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  variant?: 'default' | 'compact';
}

export function FileSelector({ 
  onFilesSelected, 
  disabled = false,
  variant = 'default'
}: FileSelectorProps) {
  const accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'text/markdown': ['.md']
  };

  if (variant === 'compact') {
    return (
      <FileUpload
        onFilesSelected={onFilesSelected}
        accept={accept}
        multiple={true}
        maxFiles={10}
        disabled={disabled}
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors"
      >
        <div className="flex items-center justify-center space-x-2 text-gray-600">
          <Upload className="w-4 h-4" />
          <span className="text-sm">Add more files</span>
        </div>
      </FileUpload>
    );
  }

  return (
    <FileUpload
      onFilesSelected={onFilesSelected}
      accept={accept}
      multiple={true}
      maxFiles={10}
      disabled={disabled}
    >
      <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p className="text-gray-600 font-medium mb-2">
        Drag & drop files here, or click to select
      </p>
      <p className="text-sm text-gray-500">
        Supported formats: PDF, DOCX, TXT, MD • Multiple files allowed
      </p>
    </FileUpload>
  );
}