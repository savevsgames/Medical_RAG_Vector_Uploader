/*
  # Fix match_documents function to work with RLS

  1. Changes
    - Drop existing match_documents function with user_id parameter
    - Create new match_documents function that uses SECURITY INVOKER
    - Remove user_id parameter from function signature
    - Let RLS policies handle user data isolation
    - Add default values for match_threshold and match_count parameters
    - Update function return columns to include filename

  2. Security
    - Switch from SECURITY DEFINER to SECURITY INVOKER
    - Function now respects RLS policies on the documents table
    - No need for manual user_id filtering
    - Grant execute permission to authenticated users
*/

-- Drop the existing function if it exists (handles different signatures)
DROP FUNCTION IF EXISTS match_documents(vector, float, int, uuid);
DROP FUNCTION IF EXISTS match_documents(vector, double precision, integer, uuid);

-- Create the vector search function with SECURITY INVOKER
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  filename text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY INVOKER -- This is the key change: it will now respect RLS
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
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION match_documents(vector, float, int) TO authenticated;

-- Verify the function was created successfully
DO $$
DECLARE
    function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'match_documents' 
        AND prosecdef = false -- Check that it's SECURITY INVOKER
    ) INTO function_exists;
    
    IF function_exists THEN
        RAISE NOTICE 'SUCCESS: match_documents function created with SECURITY INVOKER';
    ELSE
        RAISE EXCEPTION 'ERROR: match_documents function not created correctly';
    END IF;
END $$;