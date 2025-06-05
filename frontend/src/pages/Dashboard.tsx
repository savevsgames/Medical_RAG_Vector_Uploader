import React from 'react';
import { FileUpload } from '../components/FileUpload';
import { DocumentList } from '../components/DocumentList';

export function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-2xl font-semibold text-gray-900 mb-8">
            Medical Document Upload
          </h1>
          <FileUpload />
          <DocumentList />
        </div>
      </div>
    </div>
  );
}