import React from 'react';
import { FileUpload } from '../components/FileUpload';
import { DocumentList } from '../components/DocumentList';
import { Upload, FileText } from 'lucide-react';

export function Documents() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg">
            <FileText className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RAG Document Management</h1>
            <p className="text-gray-600">Upload and manage documents for AI-powered analysis</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Upload className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Upload New Document</h2>
          </div>
          <FileUpload />
        </div>
      </div>

      {/* Document List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Documents</h2>
        <DocumentList />
      </div>
    </div>
  );
}