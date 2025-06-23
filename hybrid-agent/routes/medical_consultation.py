import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
import asyncio

from core.auth_service import get_current_user
from core.exceptions import ValidationError, ProcessingError
from routes.chat import chat_with_documents
from routes.embed import generate_embedding

logger = logging.getLogger("txagent")

router = APIRouter()

# Request/Response models
class MedicalConsultationRequest(BaseModel):
    query: str = Field(..., description="Medical question or concern")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context including user_profile and conversation_history")
    session_id: Optional[str] = Field(default=None, description="Session identifier")
    preferred_agent: Optional[str] = Field(default="txagent", description="Preferred AI agent for consultation (txagent or openai)")
    
class MedicalConsultationResponse(BaseModel):
    response: Dict[str, Any]
    safety: Dict[str, Any]
    recommendations: Dict[str, Any]
    processing_time_ms: int
    session_id: str
    agent_id: str

# Emergency keywords for detection
EMERGENCY_KEYWORDS = [
    'chest pain', 'difficulty breathing', 'severe bleeding', 'unconscious',
    'heart attack', 'stroke', 'seizure', 'severe allergic reaction',
    'suicidal thoughts', 'overdose', 'can\'t breathe', 'choking',
    'severe headache', 'loss of consciousness', 'severe abdominal pain',
    'severe burns', 'poisoning', 'drug overdose', 'suicide', 'kill myself'
]

def detect_emergency(text: str) -> Dict[str, Any]:
    """Detect emergency keywords in text"""
    lower_text = text.lower()
    detected_keywords = [keyword for keyword in EMERGENCY_KEYWORDS if keyword in lower_text]
    
    return {
        "is_emergency": len(detected_keywords) > 0,
        "confidence": "high" if detected_keywords else "low",
        "detected_keywords": detected_keywords
    }

@router.post("/medical-consultation", response_model=MedicalConsultationResponse)
async def medical_consultation(
    request: MedicalConsultationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Process medical consultation request with emergency detection and AI response
    Supports both doctor (general medical RAG) and patient (personalized) contexts
    """
    start_time = datetime.now()
    user_id = current_user["user_id"]
    
    logger.info(f"🏥 Medical consultation request from user: {user_id}")
    logger.info(f"🔍 Query preview: {request.query[:100]}...")
    logger.info(f"🤖 Preferred agent: {request.preferred_agent}")
    
    # Determine context type based on presence of user_profile
    has_user_profile = bool(request.context and request.context.get("user_profile"))
    context_type = "patient" if has_user_profile else "doctor"
    
    logger.info(f"👤 Context type: {context_type} (has_user_profile: {has_user_profile})")
    
    try:
        # Validate input
        if not request.query or not request.query.strip():
            raise ValidationError("Query is required and cannot be empty")
        
        # Emergency detection (applies to both doctor and patient contexts)
        emergency_check = detect_emergency(request.query)
        
        if emergency_check["is_emergency"]:
            logger.warning(f"🚨 Emergency detected for user {user_id}: {emergency_check['detected_keywords']}")
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return MedicalConsultationResponse(
                response={
                    "text": "I've detected that you may be experiencing a medical emergency. Please contact emergency services immediately (call 911) or go to the nearest emergency room. This system cannot provide emergency medical care.",
                    "confidence_score": 0.95,
                    "sources": []
                },
                safety={
                    "emergency_detected": True,
                    "disclaimer": "This is not a substitute for professional medical advice. In case of emergency, contact emergency services immediately.",
                    "urgent_care_recommended": True
                },
                recommendations={
                    "suggested_action": "Contact emergency services immediately (911)",
                    "follow_up_questions": []
                },
                processing_time_ms=processing_time,
                session_id=request.session_id or f"emergency-{user_id}",
                agent_id="emergency_system"
            )
        
        # Process consultation based on preferred agent and context
        logger.info(f"💬 Processing {context_type} consultation for user: {user_id} with {request.preferred_agent}")
        
        # Use the enhanced chat functionality with agent selection
        chat_response = await chat_with_documents(
            query=request.query,
            history=request.context.get("conversation_history", []) if request.context else [],
            top_k=5,
            temperature=0.7,
            stream=False,
            current_user=current_user,
            preferred_agent=request.preferred_agent,
            context=request.context  # Pass full context including user_profile
        )
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Determine appropriate disclaimer based on context type
        if context_type == "patient":
            disclaimer = "This personalized information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with your healthcare provider."
            suggested_action = "Consult with your healthcare provider for personalized medical advice"
        else:
            disclaimer = "This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment."
            suggested_action = "Use this information to support clinical decision-making in conjunction with professional medical judgment"
        
        logger.info(f"✅ Medical consultation completed for user: {user_id} in {processing_time}ms using {chat_response.get('agent_id', request.preferred_agent)}")
        
        return MedicalConsultationResponse(
            response={
                "text": chat_response["response"],
                "sources": chat_response.get("sources", []),
                "confidence_score": chat_response.get("confidence_score")
            },
            safety={
                "emergency_detected": False,
                "disclaimer": disclaimer,
                "urgent_care_recommended": False
            },
            recommendations={
                "suggested_action": suggested_action,
                "follow_up_questions": []
            },
            processing_time_ms=processing_time,
            session_id=request.session_id or f"consultation-{user_id}",
            agent_id=chat_response.get("agent_id", request.preferred_agent)
        )
        
    except ValidationError as e:
        logger.error(f"❌ Validation error in medical consultation: {e.message}")
        raise HTTPException(status_code=422, detail=e.message)
        
    except ProcessingError as e:
        logger.error(f"❌ Processing error in medical consultation: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
        
    except Exception as e:
        logger.error(f"❌ Unexpected error in medical consultation: {str(e)}")
        logger.error(f"❌ Error traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Medical consultation failed: {str(e)}"
        )