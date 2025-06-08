import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';
import { Documents } from './pages/Documents';
import { Monitor } from './pages/Monitor';

function App() {
  // Add this line for debugging
  console.log('Frontend VITE_API_URL:', import.meta.env.VITE_API_URL);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/chat\" replace />} />
            <Route path="chat\" element={<Chat />} />
            <Route path="documents" element={<Documents />} />
            <Route path="monitor" element={<Monitor />} />
          </Route>
          {/* Catch-all route for any unmatched paths */}
          <Route path="*" element={<Navigate to="/\" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;