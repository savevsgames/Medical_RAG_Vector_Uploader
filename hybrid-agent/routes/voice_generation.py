import logging
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import asyncio
import os

from core.auth_service import get_current_user, get_supabase_client
from core.exceptions import ValidationError, ProcessingError

logger = logging.getLogger("txagent")

router = APIRouter()

# Request/Response models
class VoiceGenerationRequest(BaseModel):
    text: str = Field(..., description="Text to convert to speech")
    voice_id: Optional[str] = Field(default=None, description="Voice ID to use")
    consultation_id: Optional[str] = Field(default=None, description="Associated consultation ID")

class VoiceGenerationResponse(BaseModel):
    success: bool
    audio_url: str
    file_path: str
    duration_estimate: int
    voice_id: str

class VoicesResponse(BaseModel):
    voices: list
    total: int

async def generate_voice_audio(
    text: str,
    voice_id: Optional[str] = None,
    user_id: str = None,
    consultation_id: Optional[str] = None
) -> Dict[str, Any]:
    """Generate voice audio using ElevenLabs API"""
    start_time = datetime.now()
    
    try:
        # Check if ElevenLabs is configured
        elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
        if not elevenlabs_api_key:
            raise ProcessingError("Voice generation service is not configured")
        
        # Use default voice if none specified
        if not voice_id:
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "default")
        
        logger.info(f"🎤 Generating voice audio for user: {user_id}")
        logger.info(f"📝 Text length: {len(text)} characters")
        logger.info(f"🔊 Voice ID: {voice_id}")
        
        # For now, simulate the ElevenLabs API call
        # In a real implementation, this would:
        # 1. Call ElevenLabs API to generate audio
        # 2. Upload audio to Supabase Storage
        # 3. Return the public URL
        
        # Simulate processing time
        await asyncio.sleep(0.5)
        
        # Generate file path
        audio_filename = f"voice_{user_id}_{int(datetime.now().timestamp())}.mp3"
        audio_path = f"voice/{user_id}/{audio_filename}"
        
        # Simulate audio URL (in real implementation, this would be the Supabase Storage URL)
        audio_url = f"https://your-supabase-project.supabase.co/storage/v1/object/public/audio/{audio_path}"
        
        # Estimate duration (rough: 10 characters per second)
        duration_estimate = max(1, len(text) // 10)
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        logger.info(f"✅ Voice audio generated for user: {user_id} in {processing_time}ms")
        
        return {
            "success": True,
            "audio_url": audio_url,
            "file_path": audio_path,
            "duration_estimate": duration_estimate,
            "voice_id": voice_id,
            "processing_time": processing_time
        }
        
    except Exception as e:
        logger.error(f"❌ Voice generation failed: {str(e)}")
        raise ProcessingError(f"Failed to generate voice audio: {str(e)}")

async def get_available_voices() -> Dict[str, Any]:
    """Get available voices from ElevenLabs"""
    try:
        # Check if ElevenLabs is configured
        elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
        if not elevenlabs_api_key:
            raise ProcessingError("Voice service is not configured")
        
        # For now, return mock voices
        # In a real implementation, this would call ElevenLabs API
        mock_voices = [
            {
                "voice_id": "default",
                "name": "Default Voice",
                "description": "Standard medical assistant voice",
                "category": "medical"
            },
            {
                "voice_id": "professional",
                "name": "Professional Voice",
                "description": "Professional medical consultation voice",
                "category": "medical"
            },
            {
                "voice_id": "calm",
                "name": "Calm Voice",
                "description": "Calming voice for patient reassurance",
                "category": "therapeutic"
            }
        ]
        
        return {
            "voices": mock_voices,
            "total": len(mock_voices)
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to fetch voices: {str(e)}")
        raise ProcessingError(f"Failed to fetch available voices: {str(e)}")

@router.post("/generate-voice", response_model=VoiceGenerationResponse)
async def generate_voice(
    request: VoiceGenerationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate voice audio from text using ElevenLabs
    """
    try:
        # Validate input
        if not request.text or not request.text.strip():
            raise ValidationError("Text is required for voice generation")
        
        if len(request.text) > 5000:  # Reasonable limit
            raise ValidationError("Text is too long for voice generation (max 5000 characters)")
        
        user_id = current_user["user_id"]
        
        # Generate voice audio
        result = await generate_voice_audio(
            text=request.text,
            voice_id=request.voice_id,
            user_id=user_id,
            consultation_id=request.consultation_id
        )
        
        # If consultation_id is provided, update the consultation record
        if request.consultation_id:
            try:
                supabase = get_supabase_client(user_id)
                supabase.table('medical_consultations').update({
                    'voice_audio_url': result['audio_url']
                }).eq('id', request.consultation_id).eq('user_id', user_id).execute()
                
                logger.info(f"✅ Updated consultation {request.consultation_id} with voice URL")
            except Exception as e:
                logger.warning(f"⚠️ Failed to update consultation with voice URL: {str(e)}")
        
        return VoiceGenerationResponse(
            success=result["success"],
            audio_url=result["audio_url"],
            file_path=result["file_path"],
            duration_estimate=result["duration_estimate"],
            voice_id=result["voice_id"]
        )
        
    except ValidationError as e:
        logger.error(f"❌ Validation error in voice generation: {e.message}")
        raise HTTPException(status_code=422, detail=e.message)
        
    except ProcessingError as e:
        logger.error(f"❌ Processing error in voice generation: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
        
    except Exception as e:
        logger.error(f"❌ Unexpected error in voice generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Voice generation failed: {str(e)}")

@router.get("/voices", response_model=VoicesResponse)
async def get_voices(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get available voices for text-to-speech
    """
    try:
        user_id = current_user["user_id"]
        logger.info(f"🔊 Fetching available voices for user: {user_id}")
        
        result = await get_available_voices()
        
        logger.info(f"✅ Retrieved {result['total']} voices for user: {user_id}")
        
        return VoicesResponse(
            voices=result["voices"],
            total=result["total"]
        )
        
    except ProcessingError as e:
        logger.error(f"❌ Processing error in get voices: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
        
    except Exception as e:
        logger.error(f"❌ Unexpected error in get voices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch voices: {str(e)}")