/*
  # Fix RLS Policies for Documents Table

  1. Security Updates
    - Drop existing restrictive policies
    - Add proper policies for authenticated users
    - Allow users to manage their own documents
    
  2. Policy Changes
    - Allow authenticated users to insert documents
    - Allow users to read their own documents
    - Allow users to update their own documents
    - Allow users to delete their own documents
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

-- Ensure RLS is enabled
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert documents
CREATE POLICY "Users can insert documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to read their own documents
CREATE POLICY "Users can read own documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to update their own documents
CREATE POLICY "Users can update own documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete own documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure the agents table also has proper RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Drop existing agent policies if they exist
DROP POLICY IF EXISTS "Users can manage own agents" ON agents;

-- Allow users to manage their own agent sessions
CREATE POLICY "Users can manage own agents"
  ON agents
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());