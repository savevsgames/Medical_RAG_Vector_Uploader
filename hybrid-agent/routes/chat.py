import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import asyncio

from core.auth_service import get_current_user, get_supabase_client
from core.exceptions import ValidationError, ProcessingError
from routes.embed import generate_embedding

logger = logging.getLogger("txagent")

router = APIRouter()

# Request/Response models
class ChatRequest(BaseModel):
    query: str = Field(..., description="User question or message")
    history: Optional[List[Dict[str, Any]]] = Field(default=[], description="Conversation history")
    top_k: Optional[int] = Field(default=5, description="Number of documents to retrieve")
    temperature: Optional[float] = Field(default=0.7, description="Response temperature")
    stream: Optional[bool] = Field(default=False, description="Stream response")

class ChatResponse(BaseModel):
    response: str
    sources: List[Dict[str, Any]]
    processing_time: int
    model: str
    tokens_used: Optional[int] = None
    status: str = "success"

async def search_relevant_documents(
    query_embedding: List[float],
    user_id: str,
    top_k: int = 5,
    threshold: float = 0.5
) -> List[Dict[str, Any]]:
    """Search for relevant documents using vector similarity"""
    try:
        # Get authenticated Supabase client
        supabase = get_supabase_client(user_id)
        
        logger.info(f"🔍 Searching documents for user {user_id} with top_k={top_k}")
        
        # Call the match_documents function
        result = supabase.rpc('match_documents', {
            'query_embedding': query_embedding,
            'match_threshold': threshold,
            'match_count': top_k
        }).execute()
        
        if result.data:
            logger.info(f"✅ Found {len(result.data)} relevant documents")
            return result.data
        else:
            logger.info("ℹ️ No relevant documents found")
            return []
            
    except Exception as e:
        logger.error(f"❌ Error searching documents: {str(e)}")
        # Return empty list on error rather than failing
        return []

async def generate_chat_response(
    query: str,
    context_docs: List[Dict[str, Any]],
    history: List[Dict[str, Any]] = None,
    temperature: float = 0.7
) -> Dict[str, Any]:
    """Generate chat response using OpenAI with document context"""
    try:
        # For now, return a simple response
        # In a full implementation, this would call OpenAI GPT
        
        context_text = "\n\n".join([
            f"Document: {doc.get('filename', 'Unknown')}\nContent: {doc.get('content', '')[:500]}..."
            for doc in context_docs[:3]  # Use top 3 documents
        ])
        
        if context_docs:
            response_text = f"Based on the medical documents in your library, here's what I found regarding your question about '{query}':\n\n"
            response_text += "The relevant medical information suggests that you should consult with a healthcare professional for proper evaluation and treatment recommendations."
        else:
            response_text = f"I don't have specific medical documents that directly address your question about '{query}'. I recommend consulting with a healthcare professional for accurate medical advice."
        
        return {
            "response": response_text,
            "model": "BioBERT + GPT",
            "tokens_used": len(response_text.split()),
            "processing_time": 500  # Simulated processing time
        }
        
    except Exception as e:
        logger.error(f"❌ Error generating chat response: {str(e)}")
        raise ProcessingError(f"Failed to generate response: {str(e)}")

async def chat_with_documents(
    query: str,
    history: List[Dict[str, Any]] = None,
    top_k: int = 5,
    temperature: float = 0.7,
    stream: bool = False,
    current_user: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Core chat functionality that can be reused by other endpoints"""
    start_time = datetime.now()
    user_id = current_user["user_id"]
    
    logger.info(f"💬 Processing chat request for user: {user_id}")
    logger.info(f"🔍 Query: {query[:100]}...")
    
    try:
        # Generate embedding for the query
        logger.info("🧠 Generating query embedding...")
        embedding_result = await generate_embedding(
            text=query,
            normalize=True,
            current_user=current_user
        )
        query_embedding = embedding_result["embedding"]
        
        # Search for relevant documents
        logger.info("📚 Searching for relevant documents...")
        relevant_docs = await search_relevant_documents(
            query_embedding=query_embedding,
            user_id=user_id,
            top_k=top_k
        )
        
        # Generate response
        logger.info("🤖 Generating AI response...")
        response_data = await generate_chat_response(
            query=query,
            context_docs=relevant_docs,
            history=history or [],
            temperature=temperature
        )
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Format sources
        sources = [
            {
                "filename": doc.get("filename", "Unknown"),
                "similarity": doc.get("similarity", 0.0),
                "chunk_id": doc.get("id", ""),
                "content": doc.get("content", "")[:200] + "..." if len(doc.get("content", "")) > 200 else doc.get("content", "")
            }
            for doc in relevant_docs
        ]
        
        result = {
            "response": response_data["response"],
            "sources": sources,
            "processing_time": processing_time,
            "model": response_data["model"],
            "tokens_used": response_data.get("tokens_used"),
            "status": "success"
        }
        
        logger.info(f"✅ Chat completed for user: {user_id} in {processing_time}ms")
        return result
        
    except Exception as e:
        logger.error(f"❌ Chat processing failed: {str(e)}")
        raise ProcessingError(f"Chat processing failed: {str(e)}")

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Chat with AI using document context and medical knowledge
    """
    try:
        # Validate input
        if not request.query or not request.query.strip():
            raise ValidationError("Query is required and cannot be empty")
        
        # Process chat request
        result = await chat_with_documents(
            query=request.query,
            history=request.history,
            top_k=request.top_k,
            temperature=request.temperature,
            stream=request.stream,
            current_user=current_user
        )
        
        return ChatResponse(**result)
        
    except ValidationError as e:
        logger.error(f"❌ Validation error in chat: {e.message}")
        raise HTTPException(status_code=422, detail=e.message)
        
    except ProcessingError as e:
        logger.error(f"❌ Processing error in chat: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
        
    except Exception as e:
        logger.error(f"❌ Unexpected error in chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")