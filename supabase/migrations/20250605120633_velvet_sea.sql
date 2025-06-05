/*
  # Add user_id and update RLS policies

  1. Changes
    - Add user_id column to documents table
    - Add foreign key constraint to auth.users
    - Update RLS policies to enforce per-user access
  
  2. Security
    - Enable RLS (already enabled)
    - Update policies to check user_id matches auth.uid()
*/

-- Add user_id column
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can read documents" ON documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON documents;

-- Create new policies with user_id checks
CREATE POLICY "Users can read own documents"
ON documents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Update existing rows to have a user_id (optional, only if you have existing data)
-- This is safe as it only updates null user_ids
DO $$
BEGIN
  UPDATE documents 
  SET user_id = auth.uid()
  WHERE user_id IS NULL;
END $$;