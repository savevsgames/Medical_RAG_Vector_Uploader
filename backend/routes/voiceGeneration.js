import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';

export function createVoiceGenerationRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);

  // Generate voice audio from text (Phase 2 - ElevenLabs integration)
  router.post('/generate-voice', async (req, res) => {
    try {
      const userId = req.userId;
      const { text, voice_id, consultation_id } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Text is required for voice generation',
          code: 'MISSING_TEXT'
        });
      }

      errorLogger.info('Voice generation request started', {
        userId,
        textLength: text.length,
        voiceId: voice_id,
        consultationId: consultation_id,
        component: 'VoiceGeneration'
      });

      // Phase 2: Check if ElevenLabs is configured
      if (!process.env.ELEVENLABS_API_KEY) {
        errorLogger.warn('ElevenLabs not configured', {
          userId,
          component: 'VoiceGeneration'
        });

        return res.status(503).json({
          error: 'Voice generation service is not configured',
          code: 'SERVICE_NOT_CONFIGURED'
        });
      }

      // Phase 2: Call ElevenLabs API
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id || 'default'}`;
      
      const elevenLabsResponse = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text();
        throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status} - ${errorText}`);
      }

      // Phase 2: Get audio buffer
      const audioBuffer = await elevenLabsResponse.arrayBuffer();
      const audioFileName = `voice_${userId}_${Date.now()}.mp3`;
      const audioPath = `voice/${userId}/${audioFileName}`;

      // Phase 2: Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('audio')
        .upload(audioPath, audioBuffer, {
          contentType: 'audio/mpeg',
          metadata: {
            userId: userId,
            consultationId: consultation_id,
            voiceId: voice_id,
            textLength: text.length
          }
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Phase 2: Get public URL
      const { data: urlData } = supabaseClient.storage
        .from('audio')
        .getPublicUrl(audioPath);

      const audioUrl = urlData.publicUrl;

      // Phase 2: Update consultation record if provided
      if (consultation_id) {
        await supabaseClient
          .from('medical_consultations')
          .update({ voice_audio_url: audioUrl })
          .eq('id', consultation_id)
          .eq('user_id', userId);
      }

      errorLogger.info('Voice generation completed successfully', {
        userId,
        audioUrl,
        audioPath,
        consultationId: consultation_id,
        component: 'VoiceGeneration'
      });

      res.json({
        success: true,
        audio_url: audioUrl,
        file_path: audioPath,
        duration_estimate: Math.ceil(text.length / 10), // Rough estimate: 10 chars per second
        voice_id: voice_id || 'default'
      });

    } catch (error) {
      errorLogger.error('Voice generation failed', error, {
        userId: req.userId,
        textLength: req.body.text?.length,
        component: 'VoiceGeneration'
      });

      res.status(500).json({
        error: 'Voice generation failed',
        code: 'VOICE_GENERATION_FAILED',
        details: error.message
      });
    }
  });

  // Get available voices (Phase 2 - ElevenLabs voices)
  router.get('/voices', async (req, res) => {
    try {
      const userId = req.userId;

      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({
          error: 'Voice service is not configured',
          code: 'SERVICE_NOT_CONFIGURED'
        });
      }

      // Phase 2: Get available voices from ElevenLabs
      const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      });

      if (!voicesResponse.ok) {
        throw new Error(`ElevenLabs voices API error: ${voicesResponse.status}`);
      }

      const voicesData = await voicesResponse.json();

      errorLogger.info('Voices fetched successfully', {
        userId,
        voicesCount: voicesData.voices?.length || 0,
        component: 'VoiceGeneration'
      });

      res.json({
        voices: voicesData.voices || [],
        total: voicesData.voices?.length || 0
      });

    } catch (error) {
      errorLogger.error('Failed to fetch voices', error, {
        userId: req.userId,
        component: 'VoiceGeneration'
      });

      res.status(500).json({
        error: 'Failed to fetch available voices',
        code: 'VOICES_FETCH_FAILED'
      });
    }
  });

  return router;
}