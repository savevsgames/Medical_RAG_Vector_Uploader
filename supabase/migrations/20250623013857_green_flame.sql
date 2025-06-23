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

-- Enable RLS (safe to run multiple times)
ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate them
DO $$ 
BEGIN
    -- Drop policies if they exist
    DROP POLICY IF EXISTS "Users can insert their own consultations" ON public.medical_consultations;
    DROP POLICY IF EXISTS "Users can view their own consultations" ON public.medical_consultations;
    
    -- Create new policies
    CREATE POLICY "Users can insert their own consultations"
        ON public.medical_consultations FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can view their own consultations"
        ON public.medical_consultations FOR SELECT TO authenticated
        USING (auth.uid() = user_id);
END $$;

-- Indexes for performance (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS medical_consultations_user_id_idx ON public.medical_consultations (user_id);
CREATE INDEX IF NOT EXISTS medical_consultations_created_at_idx ON public.medical_consultations (created_at DESC);
CREATE INDEX IF NOT EXISTS medical_consultations_session_id_idx ON public.medical_consultations (session_id);

-- Function and trigger for updated_at (safe to recreate)
CREATE OR REPLACE FUNCTION update_medical_consultations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS update_medical_consultations_updated_at ON public.medical_consultations;
CREATE TRIGGER update_medical_consultations_updated_at
    BEFORE UPDATE ON public.medical_consultations
    FOR EACH ROW EXECUTE FUNCTION update_medical_consultations_updated_at();