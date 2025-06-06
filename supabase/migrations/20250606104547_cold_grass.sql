/*
  # Create agents table for RAG agent session management

  1. New Tables
    - `agents`
      - `id` (uuid, primary key) - Unique identifier for each agent session
      - `user_id` (uuid, foreign key) - Links to auth.users table
      - `status` (text) - Current agent state: 'initializing', 'active', 'idle', 'terminated'
      - `session_data` (jsonb) - Store agent configuration and runtime data
      - `created_at` (timestamptz) - When the agent session was created
      - `last_active` (timestamptz) - Last time the agent was used (for timeout management)
      - `terminated_at` (timestamptz) - When the agent was shut down (nullable)

  2. Security
    - Enable RLS on `agents` table
    - Add policies for users to manage only their own agent sessions

  3. Indexes
    - Index on user_id for efficient lookups
    - Index on status for filtering active agents
    - Index on last_active for cleanup operations
*/

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'initializing' CHECK (status IN ('initializing', 'active', 'idle', 'terminated')),
  session_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  last_active timestamptz DEFAULT now(),
  terminated_at timestamptz
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON agents(user_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents(status);
CREATE INDEX IF NOT EXISTS agents_last_active_idx ON agents(last_active);

-- Enable Row Level Security
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Users can read their own agent sessions
CREATE POLICY "Users can read own agents"
ON agents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create agent sessions for themselves
CREATE POLICY "Users can create own agents"
ON agents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own agent sessions
CREATE POLICY "Users can update own agents"
ON agents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own agent sessions
CREATE POLICY "Users can delete own agents"
ON agents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create a function to automatically update last_active timestamp
CREATE OR REPLACE FUNCTION update_agent_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update last_active on any update
CREATE TRIGGER update_agents_last_active
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_last_active();

-- Create a function to clean up stale agents (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_stale_agents()
RETURNS void AS $$
BEGIN
  UPDATE agents 
  SET status = 'terminated', terminated_at = now()
  WHERE status IN ('active', 'idle') 
    AND last_active < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;