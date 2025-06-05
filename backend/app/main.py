import os
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uuid
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from app.supabase_client import SupabaseClient
from app.document_processor import DocumentProcessor
from app.embedder import BioBERTEmbedder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Medical RAG Vector Uploader",
    description="API for uploading and embedding medical documents",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global clients
supabase_client = None
document_processor = None
embedder = None
security = HTTPBearer()

@app.on_event("startup")
async def startup_event():
    """Initialize clients and check environment variables on startup."""
    global supabase_client, document_processor, embedder
    
    # Check for required environment variables
    required_env_vars = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_BUCKET"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    # Initialize clients
    try:
        supabase_client = SupabaseClient()
        document_processor = DocumentProcessor()
        embedder = BioBERTEmbedder()
        logger.info("All clients initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing clients: {str(e)}")
        raise

class UploadResponse(BaseModel):
    """Response model for document upload."""
    document_id: str
    filename: str
    content_length: int
    vector_dimensions: int
    storage_path: str

def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract user_id from JWT token."""
    try:
        token = credentials.credentials
        # Decode JWT token using Supabase public key
        decoded = jwt.decode(
            token,
            os.getenv("SUPABASE_JWT_SECRET"),
            algorithms=["HS256"],
            audience="authenticated"
        )
        return decoded.get("sub")  # sub claim contains the user_id
    except Exception as e:
        logger.error(f"Error decoding JWT: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials"
        )

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "supabase_connected": supabase_client.is_connected() if supabase_client else False,
        "embedder_loaded": embedder.is_loaded() if embedder else False
    }

@app.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    user_id: str = Depends(get_user_id)
):
    """Upload and process a document, storing both the file and its embeddings."""
    try:
        # Generate a unique ID for this document
        document_id = str(uuid.uuid4())
        
        # Process the file content
        logger.info(f"Processing file: {file.filename}")
        content_bytes = await file.read()
        
        # Extract text from document
        text, metadata = document_processor.extract_text(content_bytes, file.filename)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from document")
        
        # Generate embeddings
        embedding = embedder.embed_text(text)
        
        # Upload file to Supabase Storage
        storage_path = f"docs/{document_id}/{file.filename}"
        supabase_client.upload_file(storage_path, content_bytes)
        
        # Store document metadata and embedding in Supabase
        supabase_client.insert_document(
            document_id=document_id,
            filename=file.filename,
            content=text,
            metadata=metadata,
            embedding=embedding,
            user_id=user_id
        )
        
        return UploadResponse(
            document_id=document_id,
            filename=file.filename,
            content_length=len(text),
            vector_dimensions=len(embedding),
            storage_path=storage_path
        )
        
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)