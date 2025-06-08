import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { Button } from './Button';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function FileUpload({
  onFilesSelected,
  accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'text/markdown': ['.md']
  },
  maxFiles = 1,
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = false,
  disabled = false,
  className = '',
  children
}: FileUploadProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesSelected(acceptedFiles);
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
    multiple,
    disabled
  });

  const removeFile = (fileToRemove: File) => {
    const remainingFiles = acceptedFiles.filter(file => file !== fileToRemove);
    onFilesSelected(remainingFiles);
  };

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {children || (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            {isDragActive ? (
              <p className="text-blue-500 font-medium">Drop the files here</p>
            ) : (
              <div>
                <p className="text-gray-600 font-medium">
                  Drag & drop files here, or click to select
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {Object.keys(accept).join(', ')} • Max {maxSize / 1024 / 1024}MB
                  {multiple && ` • Up to ${maxFiles} files`}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Accepted Files */}
      {acceptedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-900">Selected Files:</h4>
          {acceptedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
              <div className="flex items-center space-x-2">
                <File className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">{file.name}</span>
                <span className="text-xs text-green-600">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFile(file)}
                icon={<X className="w-4 h-4" />}
              />
            </div>
          ))}
        </div>
      )}

      {/* File Rejections */}
      {fileRejections.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-red-900">Rejected Files:</h4>
          {fileRejections.map(({ file, errors }, index) => (
            <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
              <div className="flex items-center space-x-2 mb-1">
                <File className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-800">{file.name}</span>
              </div>
              <ul className="text-xs text-red-600 ml-6">
                {errors.map((error, errorIndex) => (
                  <li key={errorIndex}>• {error.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}