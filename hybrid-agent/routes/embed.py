import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.auth_service import get_current_user
from core.exceptions import ValidationError, ProcessingError

logger = logging.getLogger("txagent")

router = APIRouter()

# Request/Response models
class EmbedRequest(BaseModel):
    text: str = Field(..., description="Text to embed")
    normalize: Optional[bool] = Field(default=True, description="Normalize embedding")

class EmbedResponse(BaseModel):
    embedding: List[float]
    dimensions: int
    model: str
    processing_time: int

async def generate_embedding(
    text: str,
    normalize: bool = True,
    current_user: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Generate BioBERT embedding for text"""
    start_time = datetime.now()
    
    try:
        # Placeholder BioBERT embedding generation
        # In a real implementation, this would use the actual BioBERT model
        import random
        
        # Generate 768-dimensional embedding (BioBERT standard)
        embedding = [random.uniform(-1, 1) for _ in range(768)]
        
        if normalize:
            # Normalize the embedding vector
            magnitude = sum(x**2 for x in embedding) ** 0.5
            if magnitude > 0:
                embedding = [x / magnitude for x in embedding]
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return {
            "embedding": embedding,
            "dimensions": 768,
            "model": "BioBERT",
            "processing_time": processing_time
        }
        
    except Exception as e:
        logger.error(f"❌ Embedding generation failed: {str(e)}")
        raise ProcessingError(f"Failed to generate embedding: {str(e)}")

@router.post("/embed", response_model=EmbedResponse)
async def embed_text(
    request: EmbedRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate BioBERT embedding for text
    """
    try:
        # Validate input
        if not request.text or not request.text.strip():
            raise ValidationError("Text is required and cannot be empty")
        
        user_id = current_user["user_id"]
        logger.info(f"🧠 Embedding request from user: {user_id}")
        logger.info(f"📝 Text length: {len(request.text)} characters")
        
        # Generate embedding
        result = await generate_embedding(
            text=request.text,
            normalize=request.normalize,
            current_user=current_user
        )
        
        logger.info(f"✅ Embedding generated for user: {user_id} in {result['processing_time']}ms")
        
        return EmbedResponse(**result)
        
    except ValidationError as e:
        logger.error(f"❌ Validation error in embed: {e.message}")
        raise HTTPException(status_code=422, detail=e.message)
        
    except ProcessingError as e:
        logger.error(f"❌ Processing error in embed: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
        
    except Exception as e:
        logger.error(f"❌ Unexpected error in embed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")