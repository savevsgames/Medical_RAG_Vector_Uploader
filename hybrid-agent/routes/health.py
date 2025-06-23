import logging
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("txagent")

router = APIRouter()

class HealthResponse(BaseModel):
    status: str
    model: str
    device: str
    version: str
    uptime: int
    memory_usage: str
    timestamp: str

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        model="dmis-lab/biobert-v1.1",
        device="cuda",
        version="1.0.0",
        uptime=3600,  # Placeholder
        memory_usage="2.1GB",  # Placeholder
        timestamp=datetime.now().isoformat()
    )