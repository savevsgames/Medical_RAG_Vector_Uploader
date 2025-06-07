/*
  # Fix RLS Policies for Agents Table

  1. Problem
    - Error 42501: "new row violates row-level security policy for table 'agents'"
    - Users cannot insert agent sessions due to missing/incorrect RLS policies

  2. Solution
    - Drop any existing conflicting policies
    - Create proper INSERT policy with correct WITH CHECK clause
    - Ensure all CRUD operations are properly secured
    - Verify RLS is enabled

  3. Security
    - Users can only manage their own agent sessions
    - All operations check auth.uid() = user_id
    - Proper isolation between users
*/

-- Ensure RLS is enabled on agents table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can read their own agents" ON agents;
DROP POLICY IF EXISTS "Users can insert their own agents" ON agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON agents;
DROP POLICY IF EXISTS "Users can read own agents" ON agents;
DROP POLICY IF EXISTS "Users can create own agents" ON agents;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON agents;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON agents;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON agents;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON agents;

-- Create INSERT policy - this is the critical one that was missing/broken
CREATE POLICY "Users can insert their own agents"
ON agents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create SELECT policy
CREATE POLICY "Users can read their own agents"
ON agents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create UPDATE policy
CREATE POLICY "Users can update their own agents"
ON agents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create DELETE policy
CREATE POLICY "Users can delete their own agents"
ON agents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Verify the policies were created successfully
DO $$
DECLARE
    policy_record RECORD;
    policy_count INTEGER := 0;
BEGIN
    -- Count and log all policies for the agents table
    FOR policy_record IN 
        SELECT policyname, cmd, permissive, roles, qual, with_check
        FROM pg_policies 
        WHERE tablename = 'agents' AND schemaname = 'public'
        ORDER BY policyname
    LOOP
        policy_count := policy_count + 1;
        RAISE NOTICE 'Policy %: % (%) - Roles: %, Using: %, With Check: %', 
            policy_count, 
            policy_record.policyname, 
            policy_record.cmd,
            array_to_string(policy_record.roles, ','),
            COALESCE(policy_record.qual, 'none'),
            COALESCE(policy_record.with_check, 'none');
    END LOOP;
    
    IF policy_count = 0 THEN
        RAISE EXCEPTION 'ERROR: No RLS policies found for agents table after creation!';
    ELSE
        RAISE NOTICE 'SUCCESS: Created % RLS policies for agents table', policy_count;
    END IF;
    
    -- Verify RLS is enabled
    IF EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'agents' 
        AND n.nspname = 'public' 
        AND c.relrowsecurity = true
    ) THEN
        RAISE NOTICE 'SUCCESS: RLS is enabled on agents table';
    ELSE
        RAISE EXCEPTION 'ERROR: RLS is not enabled on agents table!';
    END IF;
END $$;