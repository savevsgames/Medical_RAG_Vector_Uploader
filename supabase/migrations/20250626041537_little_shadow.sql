/*
  # Enhanced Medical Consultations and Conversation Sessions

  1. New Tables
    - `medical_consultations` - Enhanced consultation tracking with voice/video support
    - `conversation_sessions` - Real-time conversation session management
  
  2. Security
    - Enable RLS on both tables
    - Add policies for user data isolation
    
  3. Performance
    - Add indexes for common query patterns
    - Add triggers for automatic timestamp updates
*/

-- Medical consultations log (PHASE 1 - CORE TABLE)
CREATE TABLE IF NOT EXISTS public.medical_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  voice_audio_url TEXT,
  video_url TEXT,
  consultation_type TEXT DEFAULT 'symptom_inquiry',
  processing_time INTEGER,
  emergency_detected BOOLEAN DEFAULT FALSE,
  context_used JSONB DEFAULT '{}'::jsonb,
  confidence_score FLOAT,
  recommendations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation sessions for real-time chat (NEW)
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medical_profile JSONB DEFAULT '{}'::jsonb,
  conversation_history JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  session_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Enable RLS on medical_consultations if not already enabled
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'medical_consultations' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Enable RLS on conversation_sessions
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate them
DO $$ 
BEGIN
  -- Medical consultations policies
  DROP POLICY IF EXISTS "Users can insert their own consultations" ON public.medical_consultations;
  DROP POLICY IF EXISTS "Users can view their own consultations" ON public.medical_consultations;
  
  -- Conversation sessions policies
  DROP POLICY IF EXISTS "Users can create their own conversation sessions" ON public.conversation_sessions;
  DROP POLICY IF EXISTS "Users can view their own conversation sessions" ON public.conversation_sessions;
  DROP POLICY IF EXISTS "Users can update their own conversation sessions" ON public.conversation_sessions;
  DROP POLICY IF EXISTS "Users can delete their own conversation sessions" ON public.conversation_sessions;
  DROP POLICY IF EXISTS "Service role can manage all conversation sessions" ON public.conversation_sessions;
END $$;

-- Create policies for medical_consultations
CREATE POLICY "Users can insert their own consultations"
    ON public.medical_consultations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consultations"
    ON public.medical_consultations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Create policies for conversation_sessions
CREATE POLICY "Users can create their own conversation sessions"
    ON public.conversation_sessions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own conversation sessions"
    ON public.conversation_sessions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation sessions"
    ON public.conversation_sessions FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversation sessions"
    ON public.conversation_sessions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all conversation sessions"
    ON public.conversation_sessions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Indexes for performance (medical_consultations)
CREATE INDEX IF NOT EXISTS medical_consultations_user_id_idx ON public.medical_consultations (user_id);
CREATE INDEX IF NOT EXISTS medical_consultations_created_at_idx ON public.medical_consultations (created_at DESC);
CREATE INDEX IF NOT EXISTS medical_consultations_session_id_idx ON public.medical_consultations (session_id);

-- Indexes for performance (conversation_sessions)
CREATE INDEX IF NOT EXISTS conversation_sessions_user_id_idx ON public.conversation_sessions (user_id);
CREATE INDEX IF NOT EXISTS conversation_sessions_status_idx ON public.conversation_sessions (status);
CREATE INDEX IF NOT EXISTS conversation_sessions_created_at_idx ON public.conversation_sessions (created_at DESC);

-- Trigger functions for updated_at (create if not exists)
CREATE OR REPLACE FUNCTION update_medical_consultations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_conversation_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist, then recreate them
DROP TRIGGER IF EXISTS update_medical_consultations_updated_at ON public.medical_consultations;
DROP TRIGGER IF EXISTS update_conversation_sessions_updated_at ON public.conversation_sessions;

-- Create triggers for updated_at
CREATE TRIGGER update_medical_consultations_updated_at
    BEFORE UPDATE ON public.medical_consultations
    FOR EACH ROW EXECUTE FUNCTION update_medical_consultations_updated_at();

CREATE TRIGGER update_conversation_sessions_updated_at
    BEFORE UPDATE ON public.conversation_sessions
    FOR EACH ROW EXECUTE FUNCTION update_conversation_sessions_updated_at();