/*
  # Fix RLS policies for agents table

  1. Changes
    - Drop all existing RLS policies on agents table to ensure clean slate
    - Re-create comprehensive policies for SELECT, INSERT, UPDATE, DELETE operations
    - Ensure all policies properly check auth.uid() = user_id

  2. Security
    - Enable RLS on agents table (if not already enabled)
    - Add policies that allow users to manage only their own agent sessions
    - Ensure proper authentication checks for all operations

  3. Debugging
    - Add helpful comments for troubleshooting
    - Use consistent naming convention for policies
*/

-- Drop all existing policies for agents table to ensure clean slate
DROP POLICY IF EXISTS "Users can read own agents" ON agents;
DROP POLICY IF EXISTS "Users can create own agents" ON agents;
DROP POLICY IF EXISTS "Users can update own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON agents;
DROP POLICY IF EXISTS "Users can insert own agents" ON agents;
DROP POLICY IF EXISTS "Authenticated users can read agents" ON agents;
DROP POLICY IF EXISTS "Authenticated users can insert agents" ON agents;
DROP POLICY IF EXISTS "Authenticated users can update agents" ON agents;
DROP POLICY IF EXISTS "Authenticated users can delete agents" ON agents;

-- Ensure RLS is enabled on agents table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies for agents table

-- SELECT policy: Users can read their own agent sessions
CREATE POLICY "Users can read their own agents"
ON agents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT policy: Users can create agent sessions for themselves
CREATE POLICY "Users can insert their own agents"
ON agents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE policy: Users can update their own agent sessions
CREATE POLICY "Users can update their own agents"
ON agents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE policy: Users can delete their own agent sessions
CREATE POLICY "Users can delete their own agents"
ON agents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Verify the policies are created correctly by checking pg_policies
-- This is for debugging purposes and will show in the migration logs
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE tablename = 'agents' AND schemaname = 'public';
    
    RAISE NOTICE 'Created % RLS policies for agents table', policy_count;
    
    -- Log each policy for verification
    FOR policy_count IN 
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'agents' AND schemaname = 'public'
    LOOP
        RAISE NOTICE 'Policy exists: %', 
            (SELECT policyname FROM pg_policies 
             WHERE tablename = 'agents' AND schemaname = 'public' 
             LIMIT 1 OFFSET policy_count - 1);
    END LOOP;
END $$;