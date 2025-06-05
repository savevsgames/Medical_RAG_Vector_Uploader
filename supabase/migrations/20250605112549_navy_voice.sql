/*
  # Initialize vector support and create documents table
  
  1. Extensions
    - Enable vector extension for embedding storage
  
  2. Tables
    - Create documents table with vector support
    - Add necessary indexes for similarity search
  
  3. Functions
    - Add match_documents function for similarity search
  
  4. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table with vector support
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(768)
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create stored procedure for matching documents
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  filename text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.filename,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read documents
CREATE POLICY "Authenticated users can read documents"
ON documents
FOR SELECT
TO authenticated
USING (true);

-- Create policy for authenticated users to insert documents
CREATE POLICY "Authenticated users can insert documents"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (true);