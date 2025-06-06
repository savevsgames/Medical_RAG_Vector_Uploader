/*
  # Vector Search Function for RAG

  1. Functions
    - Drop existing `match_documents` function if it exists
    - Create new `match_documents` function for vector similarity search
    - Returns documents with similarity scores above threshold
    - Filters by user_id for security

  2. Security
    - Function respects RLS policies
    - User-specific document filtering
    - Embedding validation before search
*/

-- Drop the existing function if it exists (handles different signatures)
DROP FUNCTION IF EXISTS match_documents(vector, float, int, uuid);
DROP FUNCTION IF EXISTS match_documents(vector, double precision, integer, uuid);

-- Create the vector search function with correct return type
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  user_id uuid
)
RETURNS TABLE(
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
    documents.id,
    documents.filename,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.user_id = match_documents.user_id
    AND documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;