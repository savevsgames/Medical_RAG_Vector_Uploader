import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

export function createMedicalProfileRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);

  // Get user's medical profile
  router.get('/medical-profile', async (req, res) => {
    try {
      const userId = req.userId;

      errorLogger.info('Fetching medical profile', {
        userId,
        component: 'MedicalProfile'
      });

      // Get main profile
      const { data: profile, error: profileError } = await supabaseClient
        .from('user_medical_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      let detailedProfile = null;

      if (profile) {
        // Get detailed conditions, medications, and allergies
        const [conditionsResult, medicationsResult, allergiesResult] = await Promise.all([
          supabaseClient
            .from('profile_conditions')
            .select('*')
            .eq('profile_id', profile.id)
            .order('created_at', { ascending: false }),
          
          supabaseClient
            .from('profile_medications')
            .select('*')
            .eq('profile_id', profile.id)
            .order('created_at', { ascending: false }),
          
          supabaseClient
            .from('profile_allergies')
            .select('*')
            .eq('profile_id', profile.id)
            .order('created_at', { ascending: false })
        ]);

        detailedProfile = {
          ...profile,
          conditions: conditionsResult.data || [],
          medications: medicationsResult.data || [],
          allergies: allergiesResult.data || []
        };
      }

      res.json({
        profile: detailedProfile,
        has_profile: !!profile
      });

    } catch (error) {
      errorLogger.error('Failed to fetch medical profile', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to fetch medical profile',
        code: 'PROFILE_FETCH_FAILED'
      });
    }
  });

  // Create or update medical profile
  router.post('/medical-profile', async (req, res) => {
    try {
      const userId = req.userId;
      const {
        age, gender, height_cm, weight_kg, blood_type,
        conditions_summary, medications_summary, allergies_summary,
        family_history, conditions, medications, allergies
      } = req.body;

      errorLogger.info('Creating/updating medical profile', {
        userId,
        hasConditions: !!conditions?.length,
        hasMedications: !!medications?.length,
        hasAllergies: !!allergies?.length,
        component: 'MedicalProfile'
      });

      // Check if profile exists
      const { data: existingProfile } = await supabaseClient
        .from('user_medical_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      let profileId;

      if (existingProfile) {
        // Update existing profile
        const { data: updatedProfile, error: updateError } = await supabaseClient
          .from('user_medical_profiles')
          .update({
            age, gender, height_cm, weight_kg, blood_type,
            conditions_summary, medications_summary, allergies_summary,
            family_history, updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) throw updateError;
        profileId = updatedProfile.id;
      } else {
        // Create new profile
        const { data: newProfile, error: createError } = await supabaseClient
          .from('user_medical_profiles')
          .insert({
            user_id: userId,
            age, gender, height_cm, weight_kg, blood_type,
            conditions_summary, medications_summary, allergies_summary,
            family_history
          })
          .select()
          .single();

        if (createError) throw createError;
        profileId = newProfile.id;
      }

      // Update detailed conditions if provided
      if (conditions && Array.isArray(conditions)) {
        // Delete existing conditions
        await supabaseClient
          .from('profile_conditions')
          .delete()
          .eq('profile_id', profileId);

        // Insert new conditions
        if (conditions.length > 0) {
          const conditionsToInsert = conditions.map(condition => ({
            profile_id: profileId,
            condition_name: condition.name,
            diagnosed_at: condition.diagnosed_at,
            severity: condition.severity,
            ongoing: condition.ongoing !== false,
            notes: condition.notes
          }));

          await supabaseClient
            .from('profile_conditions')
            .insert(conditionsToInsert);
        }
      }

      // Update detailed medications if provided
      if (medications && Array.isArray(medications)) {
        // Delete existing medications
        await supabaseClient
          .from('profile_medications')
          .delete()
          .eq('profile_id', profileId);

        // Insert new medications
        if (medications.length > 0) {
          const medicationsToInsert = medications.map(medication => ({
            profile_id: profileId,
            medication_name: medication.name,
            dosage: medication.dosage,
            frequency: medication.frequency,
            start_date: medication.start_date,
            end_date: medication.end_date,
            prescribed_by: medication.prescribed_by,
            is_current: medication.is_current !== false,
            notes: medication.notes
          }));

          await supabaseClient
            .from('profile_medications')
            .insert(medicationsToInsert);
        }
      }

      // Update detailed allergies if provided
      if (allergies && Array.isArray(allergies)) {
        // Delete existing allergies
        await supabaseClient
          .from('profile_allergies')
          .delete()
          .eq('profile_id', profileId);

        // Insert new allergies
        if (allergies.length > 0) {
          const allergiesToInsert = allergies.map(allergy => ({
            profile_id: profileId,
            allergen: allergy.allergen,
            reaction: allergy.reaction,
            severity: allergy.severity,
            notes: allergy.notes
          }));

          await supabaseClient
            .from('profile_allergies')
            .insert(allergiesToInsert);
        }
      }

      errorLogger.info('Medical profile updated successfully', {
        userId,
        profileId,
        component: 'MedicalProfile'
      });

      res.json({
        success: true,
        profile_id: profileId,
        message: 'Medical profile updated successfully'
      });

    } catch (error) {
      errorLogger.error('Failed to update medical profile', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to update medical profile',
        code: 'PROFILE_UPDATE_FAILED'
      });
    }
  });

  // Get user's symptoms
  router.get('/symptoms', async (req, res) => {
    try {
      const userId = req.userId;
      const { limit = 50, offset = 0 } = req.query;

      const { data: symptoms, error } = await supabaseClient
        .from('user_symptoms')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      res.json({
        symptoms: symptoms || [],
        total: symptoms?.length || 0
      });

    } catch (error) {
      errorLogger.error('Failed to fetch symptoms', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to fetch symptoms',
        code: 'SYMPTOMS_FETCH_FAILED'
      });
    }
  });

  // Log a new symptom
  router.post('/symptoms', async (req, res) => {
    try {
      const userId = req.userId;
      const {
        symptom_name, severity, description, triggers,
        duration_hours, location
      } = req.body;

      if (!symptom_name) {
        return res.status(400).json({
          error: 'Symptom name is required',
          code: 'MISSING_SYMPTOM_NAME'
        });
      }

      const { data: symptom, error } = await supabaseClient
        .from('user_symptoms')
        .insert({
          user_id: userId,
          symptom_name,
          severity,
          description,
          triggers,
          duration_hours,
          location
        })
        .select()
        .single();

      if (error) throw error;

      errorLogger.info('New symptom logged', {
        userId,
        symptomId: symptom.id,
        symptomName: symptom_name,
        severity,
        component: 'MedicalProfile'
      });

      res.json({
        success: true,
        symptom: symptom
      });

    } catch (error) {
      errorLogger.error('Failed to log symptom', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to log symptom',
        code: 'SYMPTOM_LOG_FAILED'
      });
    }
  });

  // Get user's treatments
  router.get('/treatments', async (req, res) => {
    try {
      const userId = req.userId;
      const { limit = 50, offset = 0 } = req.query;

      const { data: treatments, error } = await supabaseClient
        .from('treatments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      res.json({
        treatments: treatments || [],
        total: treatments?.length || 0
      });

    } catch (error) {
      errorLogger.error('Failed to fetch treatments', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to fetch treatments',
        code: 'TREATMENTS_FETCH_FAILED'
      });
    }
  });

  // Add a new treatment
  router.post('/treatments', async (req, res) => {
    try {
      const userId = req.userId;
      const {
        treatment_type, name, dosage, duration, description,
        doctor_recommended, completed
      } = req.body;

      if (!treatment_type || !name) {
        return res.status(400).json({
          error: 'Treatment type and name are required',
          code: 'MISSING_TREATMENT_INFO'
        });
      }

      const { data: treatment, error } = await supabaseClient
        .from('treatments')
        .insert({
          user_id: userId,
          treatment_type,
          name,
          dosage,
          duration,
          description,
          doctor_recommended: doctor_recommended || false,
          completed: completed || false
        })
        .select()
        .single();

      if (error) throw error;

      errorLogger.info('New treatment added', {
        userId,
        treatmentId: treatment.id,
        treatmentType: treatment_type,
        treatmentName: name,
        component: 'MedicalProfile'
      });

      res.json({
        success: true,
        treatment: treatment
      });

    } catch (error) {
      errorLogger.error('Failed to add treatment', error, {
        userId: req.userId,
        component: 'MedicalProfile'
      });

      res.status(500).json({
        error: 'Failed to add treatment',
        code: 'TREATMENT_ADD_FAILED'
      });
    }
  });

  return router;
}