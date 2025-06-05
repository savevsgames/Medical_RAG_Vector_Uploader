/*
  # Update RLS policies for documents table

  1. Changes
    - Enable public read access to all documents
    - Restrict insert to authenticated users
    - Allow users to delete their own documents
    - Keep user_id tracking for auditing

  2. Security
    - Public read access for AI inference
    - Write protection with user authentication
    - Delete protection with user ownership
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;

-- Create new policies

-- Allow public read access
CREATE POLICY "Public read access"
ON documents
FOR SELECT
USING (true);

-- Only authenticated users can insert
CREATE POLICY "Only logged in users can insert"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only delete their own documents
CREATE POLICY "Users can delete their own documents"
ON documents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);