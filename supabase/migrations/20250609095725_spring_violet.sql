/*
  # Fix Document Access for Shared Medical Knowledge Base

  1. Problem
    - Current RLS policies restrict users to only their own documents
    - This breaks the shared medical knowledge base concept
    - Doctors should access ALL uploaded medical documents during chat

  2. Solution
    - Allow all authenticated users to READ all documents
    - Maintain upload restrictions (users can only upload as themselves)
    - Enable shared medical knowledge base for RAG chat

  3. Security
    - Users can still only upload documents as themselves
    - Users can still only edit/delete their own documents
    - Only READ access is shared across all authenticated users
*/

-- Drop existing restrictive read policies
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
DROP POLICY IF EXISTS "documents_user_isolation" ON documents;

-- Create new shared read access policy
CREATE POLICY "Authenticated users can read all documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (true);

-- Ensure upload restrictions remain (users can only upload as themselves)
DROP POLICY IF EXISTS "Users can insert documents" ON documents;
CREATE POLICY "Users can only upload as themselves"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Ensure edit/delete restrictions remain (users can only modify their own documents)
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can only edit their own documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can only delete their own documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);