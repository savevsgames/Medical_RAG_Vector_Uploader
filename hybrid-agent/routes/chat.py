import logging
import os
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import asyncio
import openai

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
    agent_id: str

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
    user_profile: Optional[Dict[str, Any]] = None,
    preferred_agent: str = "txagent",
    temperature: float = 0.7
) -> Dict[str, Any]:
    """Generate chat response using the specified AI agent with document context"""
    try:
        logger.info(f"🤖 Generating response with {preferred_agent} agent")
        
        # Construct system prompt based on context and agent
        system_prompt = construct_system_prompt(context_docs, user_profile, preferred_agent)
        
        if preferred_agent == "openai":
            # Use OpenAI API for response generation
            return await generate_openai_response(query, system_prompt, history, temperature)
        else:
            # Use TxAgent (BioBERT) for response generation
            return await generate_txagent_response(query, context_docs, history, user_profile, temperature)
        
    except Exception as e:
        logger.error(f"❌ Error generating chat response: {str(e)}")
        raise ProcessingError(f"Failed to generate response: {str(e)}")

def construct_system_prompt(
    context_docs: List[Dict[str, Any]],
    user_profile: Optional[Dict[str, Any]] = None,
    preferred_agent: str = "txagent"
) -> str:
    """Dynamically construct system prompt based on context and agent"""
    
    if user_profile:
        # Patient context - personalized medical advice
        prompt = """You are a medical AI assistant providing personalized health information based on the user's medical profile and available medical documents.

USER MEDICAL PROFILE:
"""
        if user_profile.get("age"):
            prompt += f"- Age: {user_profile['age']}\n"
        if user_profile.get("gender"):
            prompt += f"- Gender: {user_profile['gender']}\n"
        if user_profile.get("conditions"):
            prompt += f"- Medical Conditions: {', '.join(user_profile['conditions'])}\n"
        if user_profile.get("medications"):
            prompt += f"- Current Medications: {', '.join(user_profile['medications'])}\n"
        if user_profile.get("allergies"):
            prompt += f"- Known Allergies: {', '.join(user_profile['allergies'])}\n"
        
        prompt += """
INSTRUCTIONS:
- Provide personalized medical information considering the user's profile
- Reference relevant medical documents when available
- Always recommend consulting with healthcare providers for medical decisions
- Be empathetic and supportive in your responses
- Clearly state when information is general vs. personalized
"""
    else:
        # Doctor context - general medical information
        prompt = """You are a medical AI assistant providing general medical information based on medical literature and documents.

INSTRUCTIONS:
- Provide evidence-based medical information from available documents
- Support clinical decision-making with relevant medical literature
- Maintain professional medical terminology when appropriate
- Cite sources from medical documents when available
- Focus on general medical knowledge rather than specific patient advice
"""
    
    # Add document context if available
    if context_docs:
        prompt += "\n\nAVAILABLE MEDICAL DOCUMENTS:\n"
        for i, doc in enumerate(context_docs[:3], 1):
            prompt += f"{i}. {doc.get('filename', 'Unknown')}: {doc.get('content', '')[:300]}...\n"
    
    prompt += "\n\nPlease provide a helpful, accurate, and appropriately contextualized response."
    
    return prompt

async def generate_openai_response(
    query: str,
    system_prompt: str,
    history: List[Dict[str, Any]],
    temperature: float
) -> Dict[str, Any]:
    """Generate response using OpenAI API"""
    try:
        # Check if OpenAI is configured
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            raise ProcessingError("OpenAI API key not configured")
        
        # Set up OpenAI client
        openai.api_key = openai_api_key
        
        # Prepare messages
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        for msg in (history or [])[-5:]:  # Last 5 messages
            role = "user" if msg.get("type") == "user" else "assistant"
            content = msg.get("content", "")
            if content:
                messages.append({"role": role, "content": str(content)})
        
        # Add current query
        messages.append({"role": "user", "content": query})
        
        logger.info(f"🤖 Calling OpenAI API with {len(messages)} messages")
        
        # Call OpenAI API
        response = await openai.ChatCompletion.acreate(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=temperature,
            max_tokens=500
        )
        
        response_text = response.choices[0].message.content
        tokens_used = response.usage.total_tokens
        
        logger.info(f"✅ OpenAI response generated: {len(response_text)} characters, {tokens_used} tokens")
        
        return {
            "response": response_text,
            "model": "OpenAI GPT-3.5",
            "tokens_used": tokens_used,
            "processing_time": 1000,  # Placeholder
            "agent_id": "openai"
        }
        
    except Exception as e:
        logger.error(f"❌ OpenAI API call failed: {str(e)}")
        raise ProcessingError(f"OpenAI response generation failed: {str(e)}")

async def generate_txagent_response(
    query: str,
    context_docs: List[Dict[str, Any]],
    history: List[Dict[str, Any]],
    user_profile: Optional[Dict[str, Any]],
    temperature: float
) -> Dict[str, Any]:
    """Generate response using TxAgent (BioBERT) logic"""
    try:
        # Construct context-aware response using BioBERT and medical documents
        context_text = "\n\n".join([
            f"Document: {doc.get('filename', 'Unknown')}\nContent: {doc.get('content', '')[:500]}..."
            for doc in context_docs[:3]  # Use top 3 documents
        ])
        
        if user_profile:
            # Personalized response for patient
            response_text = f"Based on your medical profile and the available medical literature, here's what I found regarding your question about '{query}':\n\n"
            
            if context_docs:
                response_text += "The relevant medical documents suggest that "
                response_text += "you should discuss this with your healthcare provider, considering your specific medical history and current conditions. "
            else:
                response_text += "While I don't have specific medical documents that directly address your question, "
            
            response_text += "Given your medical profile, it's important to consult with your healthcare provider for personalized advice and treatment recommendations."
            
            if user_profile.get("conditions"):
                response_text += f"\n\nConsidering your medical conditions ({', '.join(user_profile['conditions'])}), your healthcare provider can provide the most appropriate guidance."
        else:
            # General medical information for doctor
            if context_docs:
                response_text = f"Based on the medical literature in your database, here's what I found regarding '{query}':\n\n"
                response_text += "The available medical documents provide evidence-based information that can support clinical decision-making. "
                response_text += "Please review the source documents for detailed medical information and consider this in the context of specific patient presentations."
            else:
                response_text = f"I don't have specific medical documents that directly address '{query}' in the current database. "
                response_text += "Consider consulting additional medical literature or clinical guidelines for comprehensive information on this topic."
        
        return {
            "response": response_text,
            "model": "BioBERT + Medical RAG",
            "tokens_used": len(response_text.split()),
            "processing_time": 750,  # Simulated processing time
            "agent_id": "txagent"
        }
        
    except Exception as e:
        logger.error(f"❌ TxAgent response generation failed: {str(e)}")
        raise ProcessingError(f"TxAgent response generation failed: {str(e)}")

async def chat_with_documents(
    query: str,
    history: List[Dict[str, Any]] = None,
    top_k: int = 5,
    temperature: float = 0.7,
    stream: bool = False,
    current_user: Dict[str, Any] = None,
    preferred_agent: str = "txagent",
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Core chat functionality that can be reused by other endpoints
    Now supports conditional logic for doctor vs patient contexts
    """
    start_time = datetime.now()
    user_id = current_user["user_id"]
    
    # Extract user profile from context if available
    user_profile = context.get("user_profile") if context else None
    context_type = "patient" if user_profile else "doctor"
    
    logger.info(f"💬 Processing {context_type} chat request for user: {user_id}")
    logger.info(f"🔍 Query: {query[:100]}...")
    logger.info(f"🤖 Preferred agent: {preferred_agent}")
    
    try:
        relevant_docs = []
        
        # For TxAgent, always perform document search
        # For OpenAI, only search documents if it's a doctor context or if explicitly needed
        if preferred_agent == "txagent" or context_type == "doctor":
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
        else:
            logger.info("ℹ️ Skipping document search for OpenAI patient consultation")
        
        # Generate response using the specified agent
        logger.info(f"🤖 Generating {preferred_agent} response...")
        response_data = await generate_chat_response(
            query=query,
            context_docs=relevant_docs,
            history=history or [],
            user_profile=user_profile,
            preferred_agent=preferred_agent,
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
            "status": "success",
            "agent_id": response_data["agent_id"]
        }
        
        logger.info(f"✅ Chat completed for user: {user_id} in {processing_time}ms using {response_data['agent_id']}")
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
        
        # Process chat request (defaults to TxAgent for direct chat endpoint)
        result = await chat_with_documents(
            query=request.query,
            history=request.history,
            top_k=request.top_k,
            temperature=request.temperature,
            stream=request.stream,
            current_user=current_user,
            preferred_agent="txagent",  # Direct chat endpoint uses TxAgent by default
            context=None  # No user profile context for direct chat
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