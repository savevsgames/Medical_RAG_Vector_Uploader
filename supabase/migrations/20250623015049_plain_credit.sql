/*
# Phase 2: Enhanced Medical Features

1. New Tables
   - `user_medical_profiles` - User health information and preferences
   - `user_symptoms` - Symptom tracking and history
   - `treatments` - Treatment recommendations and tracking
   - Junction tables for relationships

2. Enhanced Features
   - Medical profile management
   - Symptom logging and tracking
   - Treatment recommendations
   - Voice generation support

3. Security
   - Enable RLS on all new tables
   - Add policies for user data isolation
   - Add indexes for performance
*/

-- User medical profiles for personalized care
CREATE TABLE IF NOT EXISTS public.user_medical_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  age INTEGER CHECK (age >= 0 AND age <= 120),
  gender gender_type,
  height_cm NUMERIC(5,2),
  weight_kg NUMERIC(5,2),
  blood_type blood_type,
  conditions_summary TEXT,
  medications_summary TEXT,
  allergies_summary TEXT,
  family_history TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User symptoms tracking
CREATE TABLE IF NOT EXISTS public.user_symptoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symptom_name TEXT NOT NULL,
  severity INTEGER CHECK (severity >= 1 AND severity <= 10),
  description TEXT,
  triggers TEXT,
  duration_hours INTEGER,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Treatments and recommendations
CREATE TABLE IF NOT EXISTS public.treatments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  treatment_type treatment_type NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  duration TEXT,
  description TEXT,
  doctor_recommended BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Doctor visits tracking
CREATE TABLE IF NOT EXISTS public.doctor_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_ts TIMESTAMPTZ NOT NULL,
  doctor_name TEXT,
  location TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  visit_prep TEXT,
  visit_summary TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Junction table: symptoms to treatments
CREATE TABLE IF NOT EXISTS public.symptom_treatments (
  symptom_id UUID NOT NULL REFERENCES user_symptoms(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  PRIMARY KEY (symptom_id, treatment_id)
);

-- Junction table: visits to symptoms
CREATE TABLE IF NOT EXISTS public.visit_symptoms (
  visit_id UUID NOT NULL REFERENCES doctor_visits(id) ON DELETE CASCADE,
  symptom_id UUID NOT NULL REFERENCES user_symptoms(id) ON DELETE CASCADE,
  PRIMARY KEY (visit_id, symptom_id)
);

-- Junction table: visits to treatments
CREATE TABLE IF NOT EXISTS public.visit_treatments (
  visit_id UUID NOT NULL REFERENCES doctor_visits(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  PRIMARY KEY (visit_id, treatment_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.user_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_treatments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_medical_profiles
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_owner" ON public.user_medical_profiles;
  CREATE POLICY "profiles_owner"
    ON public.user_medical_profiles FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- RLS Policies for user_symptoms
DO $$ BEGIN
  DROP POLICY IF EXISTS "symptoms_owner" ON public.user_symptoms;
  CREATE POLICY "symptoms_owner"
    ON public.user_symptoms FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- RLS Policies for treatments
DO $$ BEGIN
  DROP POLICY IF EXISTS "treatments_owner" ON public.treatments;
  CREATE POLICY "treatments_owner"
    ON public.treatments FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- RLS Policies for doctor_visits
DO $$ BEGIN
  DROP POLICY IF EXISTS "visits_owner" ON public.doctor_visits;
  CREATE POLICY "visits_owner"
    ON public.doctor_visits FOR ALL TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- RLS Policies for junction tables (check ownership through related tables)
DO $$ BEGIN
  DROP POLICY IF EXISTS "link_sympt_treat" ON public.symptom_treatments;
  CREATE POLICY "link_sympt_treat"
    ON public.symptom_treatments FOR ALL TO public
    USING (
      auth.uid() = (SELECT user_id FROM user_symptoms WHERE id = symptom_id) AND
      auth.uid() = (SELECT user_id FROM treatments WHERE id = treatment_id)
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "link_visit_sympt" ON public.visit_symptoms;
  CREATE POLICY "link_visit_sympt"
    ON public.visit_symptoms FOR ALL TO public
    USING (
      auth.uid() = (SELECT user_id FROM doctor_visits WHERE id = visit_id) AND
      auth.uid() = (SELECT user_id FROM user_symptoms WHERE id = symptom_id)
    );
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "link_visit_treat" ON public.visit_treatments;
  CREATE POLICY "link_visit_treat"
    ON public.visit_treatments FOR ALL TO public
    USING (
      auth.uid() = (SELECT user_id FROM doctor_visits WHERE id = visit_id) AND
      auth.uid() = (SELECT user_id FROM treatments WHERE id = treatment_id)
    );
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS user_med_profiles_user_idx ON public.user_medical_profiles (user_id);
CREATE INDEX IF NOT EXISTS user_symptoms_user_id_created_at_idx ON public.user_symptoms (user_id, created_at);
CREATE INDEX IF NOT EXISTS treatments_user_id_created_at_idx ON public.treatments (user_id, created_at);
CREATE INDEX IF NOT EXISTS doctor_visits_user_id_visit_ts_idx ON public.doctor_visits (user_id, visit_ts);

-- Add detailed medical condition tracking
CREATE TABLE IF NOT EXISTS public.profile_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES user_medical_profiles(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  diagnosed_at DATE,
  severity INTEGER CHECK (severity >= 1 AND severity <= 10),
  ongoing BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add detailed medication tracking
CREATE TABLE IF NOT EXISTS public.profile_medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES user_medical_profiles(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  prescribed_by TEXT,
  is_current BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add detailed allergy tracking
CREATE TABLE IF NOT EXISTS public.profile_allergies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES user_medical_profiles(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  reaction TEXT,
  severity INTEGER CHECK (severity >= 1 AND severity <= 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on detailed tracking tables
ALTER TABLE public.profile_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_allergies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for detailed tracking (check ownership through profile)
DO $$ BEGIN
  DROP POLICY IF EXISTS "conditions_owner" ON public.profile_conditions;
  CREATE POLICY "conditions_owner"
    ON public.profile_conditions FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id));
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "medications_owner" ON public.profile_medications;
  CREATE POLICY "medications_owner"
    ON public.profile_medications FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id));
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "allergies_owner" ON public.profile_allergies;
  CREATE POLICY "allergies_owner"
    ON public.profile_allergies FOR ALL TO public
    USING (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id))
    WITH CHECK (auth.uid() = (SELECT user_id FROM user_medical_profiles WHERE id = profile_id));
END $$;

-- Performance indexes for detailed tracking
CREATE INDEX IF NOT EXISTS profile_cond_profile_idx ON public.profile_conditions (profile_id);
CREATE INDEX IF NOT EXISTS profile_med_profile_idx ON public.profile_medications (profile_id);
CREATE INDEX IF NOT EXISTS profile_allergy_profile_idx ON public.profile_allergies (profile_id);