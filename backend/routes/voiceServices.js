import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js'; // ✅ ADD: Import config for environment variables
import axios from 'axios';

export function createVoiceServicesRouter(supabaseClient) {
  const router = express.Router();
  router.use(verifyToken);

  // Text-to-Speech endpoint
  router.post('/tts', async (req, res) => {
    const startTime = Date.now();
    const userId = req.userId;

    try {
      const { text, voice_id, consultation_id } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Text is required for voice generation',
          code: 'MISSING_TEXT'
        });
      }

      errorLogger.info('TTS request received', {
        userId,
        textLength: text.length,
        voiceId: voice_id,
        consultationId: consultation_id,
        component: 'VoiceServices'
      });

      // Check if ElevenLabs is configured
      if (!config.elevenlabs.apiKey) {
        errorLogger.warn('ElevenLabs not configured for TTS', {
          userId,
          component: 'VoiceServices'
        });

        return res.status(503).json({
          error: 'Text-to-speech service is not configured',
          code: 'TTS_SERVICE_NOT_CONFIGURED'
        });
      }

      // ✅ CRITICAL: Validate required environment variables before proceeding
      if (!config.supabase.url || !config.supabase.anonKey) {
        errorLogger.error('Missing required Supabase configuration for TTS', {
          userId,
          hasSupabaseUrl: !!config.supabase.url,
          hasSupabaseAnonKey: !!config.supabase.anonKey,
          component: 'VoiceServices'
        });

        return res.status(500).json({
          error: 'Text-to-speech service configuration error',
          code: 'TTS_CONFIG_ERROR',
          details: 'Missing Supabase configuration'
        });
      }

      // Call ElevenLabs API
      const elevenLabsVoiceId = voice_id || config.elevenlabs.voiceId || 'default';
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      
      errorLogger.debug('Calling ElevenLabs API', {
        userId,
        elevenLabsUrl,
        voiceId: elevenLabsVoiceId,
        textLength: text.length,
        component: 'VoiceServices'
      });

      const elevenLabsResponse = await axios.post(
        elevenLabsUrl,
        {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': config.elevenlabs.apiKey
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      if (elevenLabsResponse.status !== 200) {
        throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status}`);
      }

      errorLogger.debug('ElevenLabs API response received', {
        userId,
        status: elevenLabsResponse.status,
        audioSize: elevenLabsResponse.data.byteLength,
        component: 'VoiceServices'
      });

      // Generate unique filename
      const audioFileName = `tts_${userId}_${Date.now()}.mp3`;
      const audioPath = `voice/${userId}/${audioFileName}`;

      // ✅ CRITICAL FIX: Create user-authenticated Supabase client for storage upload
      errorLogger.debug('Creating user-authenticated Supabase client for storage upload', {
        userId,
        audioPath,
        hasAuthToken: !!req.headers.authorization,
        authTokenPreview: req.headers.authorization ? req.headers.authorization.substring(0, 30) + '...' : 'none',
        supabaseUrl: config.supabase.url,
        hasAnonKey: !!config.supabase.anonKey,
        component: 'VoiceServices'
      });

      const userSupabaseClient = createClient(
        config.supabase.url,
        config.supabase.anonKey, // ✅ Use anon key from config
        {
          global: {
            headers: {
              Authorization: req.headers.authorization, // ✅ User's JWT for RLS
            },
          },
        }
      );

      errorLogger.debug('User-authenticated client created, uploading audio to storage', {
        userId,
        audioPath,
        audioSize: elevenLabsResponse.data.byteLength,
        bucket: 'audio',
        authMethod: 'user_jwt',
        component: 'VoiceServices'
      });

      // ✅ FIXED: Upload to Supabase Storage using user-authenticated client
      const { data: uploadData, error: uploadError } = await userSupabaseClient.storage
        .from('audio')
        .upload(audioPath, elevenLabsResponse.data, {
          contentType: 'audio/mpeg',
          upsert: false, // Set to true if you want to allow overwrite
          metadata: {
            userId: userId,
            consultationId: consultation_id,
            voiceId: elevenLabsVoiceId,
            textLength: text.length,
            generatedAt: new Date().toISOString()
          }
        });

      if (uploadError) {
        errorLogger.error('Supabase storage upload failed for TTS audio', {
          error_message: uploadError.message,
          error_code: uploadError.status,
          audio_path: audioPath,
          user_id: userId,
          bucket: 'audio',
          auth_context: 'user_jwt',
          rls_check: {
            auth_uid: userId,
            folder_structure: audioPath.split('/'),
            first_folder: audioPath.split('/')[0],
            policy_match: audioPath.split('/')[1] === userId,
          },
          component: 'VoiceServices'
        });
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      errorLogger.success('TTS audio uploaded to storage successfully', {
        filePath: uploadData.path,
        audioPath: audioPath,
        userId: userId,
        authContext: 'user_jwt',
        rlsPolicyMatch: '✅ auth.uid() matches user folder',
        component: 'VoiceServices'
      });

      // ✅ FIXED: Get public URL using user-authenticated client
      const { data: urlData } = userSupabaseClient.storage
        .from('audio')
        .getPublicUrl(audioPath);

      const audioUrl = urlData.publicUrl;

      // Update consultation record if provided (using service role client for database operations)
      if (consultation_id) {
        try {
          await supabaseClient
            .from('medical_consultations')
            .update({ voice_audio_url: audioUrl })
            .eq('id', consultation_id)
            .eq('user_id', userId);
        } catch (updateError) {
          errorLogger.warn('Failed to update consultation with audio URL', updateError, {
            userId,
            consultationId: consultation_id,
            component: 'VoiceServices'
          });
        }
      }

      const processingTime = Date.now() - startTime;

      errorLogger.info('TTS generation completed successfully', {
        userId,
        audioUrl,
        audioPath,
        consultationId: consultation_id,
        processingTime,
        component: 'VoiceServices'
      });

      res.json({
        success: true,
        audio_url: audioUrl,
        file_path: audioPath,
        duration_estimate: Math.ceil(text.length / 10), // Rough estimate: 10 chars per second
        voice_id: elevenLabsVoiceId,
        processing_time_ms: processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'TTS generation failed';

      errorLogger.error('TTS generation failed', error, {
        userId,
        textLength: req.body.text?.length,
        processingTime,
        component: 'VoiceServices'
      });

      res.status(500).json({
        error: 'Text-to-speech generation failed',
        code: 'TTS_GENERATION_FAILED',
        details: errorMessage,
        processing_time_ms: processingTime
      });
    }
  });

  // Speech-to-Text endpoint (transcription)
  router.post('/transcribe', async (req, res) => {
    const startTime = Date.now();
    const userId = req.userId;

    try {
      const { audio_url, audio_data, language = 'en' } = req.body;

      if (!audio_url && !audio_data) {
        return res.status(400).json({
          error: 'Either audio_url or audio_data is required for transcription',
          code: 'MISSING_AUDIO'
        });
      }

      errorLogger.info('Transcription request received', {
        userId,
        hasAudioUrl: !!audio_url,
        hasAudioData: !!audio_data,
        language,
        component: 'VoiceServices'
      });

      // Check if OpenAI is configured for Whisper API
      if (!config.openai.apiKey) {
        errorLogger.warn('OpenAI not configured for transcription', {
          userId,
          component: 'VoiceServices'
        });

        return res.status(503).json({
          error: 'Speech-to-text service is not configured',
          code: 'STT_SERVICE_NOT_CONFIGURED'
        });
      }

      let audioBuffer;

      if (audio_url) {
        // Download audio from URL
        try {
          const audioResponse = await axios.get(audio_url, {
            responseType: 'arraybuffer',
            timeout: 30000
          });
          audioBuffer = audioResponse.data;
        } catch (downloadError) {
          throw new Error(`Failed to download audio from URL: ${downloadError.message}`);
        }
      } else {
        // Use provided audio data (base64 encoded)
        try {
          audioBuffer = Buffer.from(audio_data, 'base64');
        } catch (decodeError) {
          throw new Error('Invalid audio_data format. Expected base64 encoded audio.');
        }
      }

      // Create FormData for OpenAI Whisper API
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      formData.append('file', audioBuffer, {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg'
      });
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('response_format', 'json');

      // Call OpenAI Whisper API
      const whisperResponse = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${config.openai.apiKey}`,
            ...formData.getHeaders()
          },
          timeout: 60000
        }
      );

      const transcription = whisperResponse.data;

      const processingTime = Date.now() - startTime;

      errorLogger.info('Transcription completed successfully', {
        userId,
        transcriptionLength: transcription.text?.length || 0,
        language,
        processingTime,
        component: 'VoiceServices'
      });

      res.json({
        success: true,
        text: transcription.text,
        language: language,
        confidence: 0.9, // Whisper doesn't provide confidence scores
        processing_time_ms: processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Transcription failed';

      errorLogger.error('Transcription failed', error, {
        userId,
        processingTime,
        component: 'VoiceServices'
      });

      if (error.response?.status === 429) {
        res.status(429).json({
          error: 'OpenAI rate limit exceeded for transcription',
          code: 'STT_RATE_LIMIT',
          details: 'Please try again later',
          processing_time_ms: processingTime
        });
      } else if (error.response?.status === 401) {
        res.status(503).json({
          error: 'OpenAI API authentication failed',
          code: 'STT_AUTH_FAILED',
          details: 'Please check OpenAI API configuration',
          processing_time_ms: processingTime
        });
      } else {
        res.status(500).json({
          error: 'Speech-to-text transcription failed',
          code: 'STT_TRANSCRIPTION_FAILED',
          details: errorMessage,
          processing_time_ms: processingTime
        });
      }
    }
  });

  // Get available voices endpoint
  router.get('/voices', async (req, res) => {
    const userId = req.userId;

    try {
      if (!config.elevenlabs.apiKey) {
        return res.status(503).json({
          error: 'Voice service is not configured',
          code: 'VOICE_SERVICE_NOT_CONFIGURED'
        });
      }

      // Get available voices from ElevenLabs
      const voicesResponse = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': config.elevenlabs.apiKey
        },
        timeout: 10000
      });

      const voicesData = voicesResponse.data;

      errorLogger.info('Voices fetched successfully', {
        userId,
        voicesCount: voicesData.voices?.length || 0,
        component: 'VoiceServices'
      });

      res.json({
        success: true,
        voices: voicesData.voices || [],
        total: voicesData.voices?.length || 0
      });

    } catch (error) {
      errorLogger.error('Failed to fetch voices', error, {
        userId,
        component: 'VoiceServices'
      });

      res.status(500).json({
        error: 'Failed to fetch available voices',
        code: 'VOICES_FETCH_FAILED',
        details: error.message
      });
    }
  });

  return router;
}