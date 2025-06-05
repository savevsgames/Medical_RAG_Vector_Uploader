/*
  # Add created_at column to documents table
  
  1. Changes
    - Add `created_at` column to `documents` table with default value of `now()`
    
  2. Security
    - No changes to RLS policies needed
*/

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();