/*
  # Create conversation sessions table for real-time conversational AI

  1. New Tables
    - `conversation_sessions`
      - `id` (text, primary key) - Unique session identifier
      - `user_id` (uuid, foreign key) - References auth.users
      - `medical_profile` (jsonb) - User's medical profile for context
      - `conversation_history` (jsonb) - Array of conversation messages
      - `status` (text) - Session status (active, paused, ended)
      - `session_metadata` (jsonb) - Additional session data
      - `created_at` (timestamptz) - Session creation time
      - `updated_at` (timestamptz) - Last update time
      - `ended_at` (timestamptz) - Session end time

  2. Security
    - Enable RLS on `conversation_sessions` table
    - Add policies for users to manage their own sessions
    - Service role can manage all sessions for system operations

  3. Indexes
    - Index on user_id for fast user session lookups
    - Index on status for filtering active sessions
    - Index on created_at for chronological ordering
*/

-- Create conversation_sessions table
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    medical_profile jsonb DEFAULT '{}',
    conversation_history jsonb DEFAULT '[]',
    status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
    session_metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS conversation_sessions_user_id_idx ON public.conversation_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS conversation_sessions_status_idx ON public.conversation_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS conversation_sessions_created_at_idx ON public.conversation_sessions USING btree (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_sessions
CREATE POLICY "Users can view their own conversation sessions"
    ON public.conversation_sessions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversation sessions"
    ON public.conversation_sessions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation sessions"
    ON public.conversation_sessions FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversation sessions"
    ON public.conversation_sessions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Service role can manage all sessions
CREATE POLICY "Service role can manage all conversation sessions"
    ON public.conversation_sessions FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_sessions_updated_at
    BEFORE UPDATE ON public.conversation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_sessions_updated_at();