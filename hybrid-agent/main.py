import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from datetime import datetime
import traceback
import asyncio
from typing import Optional, Dict, Any, List

# Import core services
from core.auth_service import AuthService, get_current_user
from core.logging import setup_logging, log_request_start, log_request_success, log_request_error
from core.exceptions import AuthenticationError, ValidationError, ProcessingError

# Import route handlers
from routes.health import router as health_router
from routes.embed import router as embed_router
from routes.chat import router as chat_router
from routes.process_document import router as process_document_router
from routes.medical_consultation import router as medical_consultation_router

# Setup logging
logger = setup_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("🚀 TxAgent container starting up...")
    
    # Initialize services
    try:
        # Initialize auth service
        auth_service = AuthService()
        app.state.auth_service = auth_service
        logger.info("✅ Authentication service initialized")
        
        # Add any other initialization here
        logger.info("✅ TxAgent container startup complete")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize TxAgent container: {e}")
        raise
    
    yield
    
    # Cleanup
    logger.info("🔄 TxAgent container shutting down...")

# Create FastAPI app
app = FastAPI(
    title="TxAgent Medical RAG Container",
    description="GPU-accelerated medical document processing and chat with BioBERT",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests and responses"""
    start_time = datetime.now()
    
    # Log request start
    log_request_start(request)
    
    try:
        response = await call_next(request)
        
        # Log successful response
        processing_time = (datetime.now() - start_time).total_seconds()
        log_request_success(request, response.status_code, processing_time)
        
        return response
        
    except Exception as e:
        # Log error
        processing_time = (datetime.now() - start_time).total_seconds()
        log_request_error(request, e, processing_time)
        
        # Return error response
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "details": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )

# Global exception handlers
@app.exception_handler(AuthenticationError)
async def auth_exception_handler(request: Request, exc: AuthenticationError):
    logger.warning(f"🔒 Authentication error: {exc.message}")
    return JSONResponse(
        status_code=401,
        content={
            "error": "Authentication failed",
            "details": exc.message,
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.warning(f"📝 Validation error: {exc.message}")
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation failed",
            "details": exc.message,
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(ProcessingError)
async def processing_exception_handler(request: Request, exc: ProcessingError):
    logger.error(f"⚙️ Processing error: {exc.message}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Processing failed",
            "details": exc.message,
            "timestamp": datetime.now().isoformat()
        }
    )

# Include routers
app.include_router(health_router, tags=["Health"])
app.include_router(embed_router, prefix="/api", tags=["Embedding"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])
app.include_router(process_document_router, prefix="/api", tags=["Document Processing"])
app.include_router(medical_consultation_router, prefix="/api", tags=["Medical Consultation"])

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with basic info"""
    return {
        "service": "TxAgent Medical RAG Container",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "health": "/health",
            "embed": "/api/embed",
            "chat": "/api/chat", 
            "process_document": "/api/process-document",
            "medical_consultation": "/api/medical-consultation"
        },
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    debug = os.getenv("DEBUG", "false").lower() == "true"
    
    logger.info(f"🚀 Starting TxAgent container on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info"
    )