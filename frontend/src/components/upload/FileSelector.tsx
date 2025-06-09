import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface FileSelectorProps {
  onFileSelect: (files: File[]) => void;
  selectedFiles: File[];
  disabled?: boolean;
}

export function FileSelector({ onFileSelect, selectedFiles, disabled }: FileSelectorProps) {
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      console.warn('Some files were rejected:', rejectedFiles);
    }
    
    if (acceptedFiles.length > 0) {
      onFileSelect([...selectedFiles, ...acceptedFiles]);
    }
  }, [onFileSelect, selectedFiles]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxFiles: 10,
    disabled,
    onDropRejected: (fileRejections) => {
      console.warn('File upload rejected:', fileRejections);
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200 ${
        disabled 
          ? 'border-soft-gray/30 bg-soft-gray/5 cursor-not-allowed opacity-50'
          : isDragReject
          ? 'border-red-300 bg-red-50'
          : isDragActive 
          ? 'border-healing-teal bg-healing-teal/5' 
          : 'border-soft-gray/30 hover:border-healing-teal/50 hover:bg-healing-teal/5'
      }`}
    >
      <input {...getInputProps()} />
      
      <div className="flex flex-col items-center space-y-4">
        {isDragReject ? (
          <AlertCircle className="w-12 h-12 text-red-400" />
        ) : (
          <div className={`p-3 rounded-xl ${
            isDragActive ? 'bg-healing-teal/10' : 'bg-soft-gray/10'
          }`}>
            <Upload className={`w-8 h-8 ${
              isDragActive ? 'text-healing-teal' : 'text-soft-gray'
            }`} />
          </div>
        )}
        
        <div>
          {isDragReject ? (
            <div>
              <p className="text-red-600 font-subheading font-medium">Invalid file type</p>
              <p className="text-sm text-red-500 mt-1 font-body">
                Please upload PDF, DOCX, TXT, or MD files only
              </p>
            </div>
          ) : isDragActive ? (
            <div>
              <p className="text-healing-teal font-subheading font-medium">Drop files here</p>
              <p className="text-sm text-healing-teal/80 mt-1 font-body">
                Release to add them to your upload queue
              </p>
            </div>
          ) : (
            <div>
              <p className="text-deep-midnight font-subheading font-medium">
                Drag & drop files here, or click to select
              </p>
              <p className="text-sm text-soft-gray mt-2 font-body">
                Supported formats: PDF, DOCX, TXT, MD
              </p>
              <p className="text-xs text-soft-gray mt-1 font-body">
                Maximum 10 files at once
              </p>
            </div>
          )}
        </div>

        {/* Supported File Types */}
        <div className="flex items-center space-x-4 text-xs text-soft-gray">
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3" />
            <span className="font-body">PDF</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3" />
            <span className="font-body">DOCX</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3" />
            <span className="font-body">TXT</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3" />
            <span className="font-body">MD</span>
          </div>
        </div>
      </div>
    </div>
  );
}