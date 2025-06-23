/*
  # Medical Consultation Tables Migration

  1. New Tables
    - `medical_consultations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `session_id` (text, agent session identifier)
      - `query` (text, user's medical question)
      - `response` (text, AI-generated response)
      - `sources` (jsonb, document sources used)
      - `voice_audio_url` (text, optional voice response URL)
      - `video_url` (text, optional video response URL)
      - `consultation_type` (text, type of consultation)
      - `processing_time` (integer, processing time in ms)
      - `emergency_detected` (boolean, emergency detection flag)
      - `context_used` (jsonb, context information used)
      - `confidence_score` (float, AI confidence score)
      - `recommendations` (jsonb, AI recommendations)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `medical_consultations` table
    - Add policies for users to manage their own consultations
    - Add performance indexes
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

-- Enable RLS
ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own consultations"
    ON public.medical_consultations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consultations"
    ON public.medical_consultations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS medical_consultations_user_id_idx ON public.medical_consultations (user_id);
CREATE INDEX IF NOT EXISTS medical_consultations_created_at_idx ON public.medical_consultations (created_at DESC);
CREATE INDEX IF NOT EXISTS medical_consultations_session_id_idx ON public.medical_consultations (session_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_medical_consultations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_medical_consultations_updated_at
    BEFORE UPDATE ON public.medical_consultations
    FOR EACH ROW EXECUTE FUNCTION update_medical_consultations_updated_at();