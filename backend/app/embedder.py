import logging
import os
from typing import List, Optional
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

class BioBERTEmbedder:
    """Generates embeddings using BioBERT model via RunPod API."""
    
    def __init__(self):
        """Initialize the RunPod embedder client."""
        logger.info("Initializing RunPod embedder client")
        self.embedding_url = os.getenv("RUNPOD_EMBEDDING_URL")
        self.api_key = os.getenv("RUNPOD_EMBEDDING_KEY")
        
        if not self.embedding_url or not self.api_key:
            raise ValueError("RUNPOD_EMBEDDING_URL and RUNPOD_EMBEDDING_KEY must be set")
        
        # Initialize HTTP client with default headers
        self.client = httpx.Client(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
        )
    
    def is_loaded(self) -> bool:
        """Check if the RunPod service is configured and accessible."""
        try:
            # Make a test request to the API
            response = self.client.get(f"{self.embedding_url}/health")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Error checking RunPod service: {str(e)}")
            return False
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def embed_text(self, text: str, max_length: int = 512) -> List[float]:
        """
        Generate embedding for the given text using RunPod API.
        
        Args:
            text: The text to embed
            max_length: Maximum token length (handled by RunPod service)
            
        Returns:
            Vector embedding as a list of floats
        """
        try:
            # Prepare request payload
            payload = {
                "text": text,
                "max_length": max_length
            }
            
            # Make request to RunPod API
            response = self.client.post(
                f"{self.embedding_url}/embed",
                json=payload,
                timeout=30.0  # 30 second timeout
            )
            
            # Check for successful response
            response.raise_for_status()
            
            # Parse response
            result = response.json()
            if "error" in result:
                raise RuntimeError(f"RunPod API error: {result['error']}")
            
            embeddings = result.get("embedding")
            if not embeddings:
                raise ValueError("No embedding returned from RunPod API")
            
            logger.info(f"Generated embedding with {len(embeddings)} dimensions via RunPod")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating embedding via RunPod: {str(e)}")
            raise
    
    def embed_batch(self, texts: List[str], batch_size: int = 8) -> List[List[float]]:
        """
        Generate embeddings for a batch of texts.
        
        Args:
            texts: List of texts to embed
            batch_size: Number of texts to process at once
            
        Returns:
            List of vector embeddings
        """
        try:
            # Prepare batch payload
            payload = {
                "texts": texts,
                "batch_size": batch_size
            }
            
            # Make batch request to RunPod API
            response = self.client.post(
                f"{self.embedding_url}/embed_batch",
                json=payload,
                timeout=60.0  # 60 second timeout for batch processing
            )
            
            # Check for successful response
            response.raise_for_status()
            
            # Parse response
            result = response.json()
            if "error" in result:
                raise RuntimeError(f"RunPod API error: {result['error']}")
            
            embeddings = result.get("embeddings")
            if not embeddings:
                raise ValueError("No embeddings returned from RunPod API")
            
            logger.info(f"Generated {len(embeddings)} embeddings via RunPod")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating batch embeddings via RunPod: {str(e)}")
            # Fall back to sequential processing if batch fails
            results = []
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                batch_results = [self.embed_text(text) for text in batch]
                results.extend(batch_results)
            return results