import logging
import os
from typing import List, Optional
import torch
from transformers import AutoTokenizer, AutoModel
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

class BioBERTEmbedder:
    """Generates embeddings using BioBERT model."""
    
    def __init__(self, model_name: str = "dmis-lab/biobert-base-cased-v1.1"):
        """
        Initialize the BioBERT embedder.
        
        Args:
            model_name: HuggingFace model identifier for BioBERT
        """
        logger.info(f"Initializing BioBERT embedder with model: {model_name}")
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load model and tokenizer
        self._load_model()
    
    def _load_model(self):
        """Load the BioBERT model and tokenizer."""
        try:
            logger.info(f"Loading BioBERT model and tokenizer from {self.model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name)
            
            # Move model to GPU if available
            self.model.to(self.device)
            
            # Set model to evaluation mode
            self.model.eval()
            
            logger.info(f"BioBERT model loaded successfully (device: {self.device})")
        except Exception as e:
            logger.error(f"Error loading BioBERT model: {str(e)}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if the model is loaded."""
        return self.model is not None and self.tokenizer is not None
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def embed_text(self, text: str, max_length: int = 512) -> List[float]:
        """
        Generate embedding for the given text.
        
        Args:
            text: The text to embed
            max_length: Maximum token length for the model
            
        Returns:
            Vector embedding as a list of floats
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded. Initialize the embedder first.")
        
        try:
            # Truncate text if too long (simple approach)
            # A more sophisticated approach would chunk and average embeddings
            if len(text) > max_length * 10:  # Rough character estimate
                logger.warning(f"Text length ({len(text)}) exceeds model capacity, truncating")
                text = text[:max_length * 10]  # Simple truncation
            
            # Tokenize and prepare inputs
            inputs = self.tokenizer(
                text,
                return_tensors="pt",
                max_length=max_length,
                padding="max_length",
                truncation=True
            )
            
            # Move inputs to same device as model
            inputs = {key: val.to(self.device) for key, val in inputs.items()}
            
            # Generate embeddings
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            # Get CLS token embedding (first token)
            embeddings = outputs.last_hidden_state[:, 0, :].cpu().numpy()[0]
            
            logger.info(f"Generated embedding with {len(embeddings)} dimensions")
            return embeddings.tolist()
            
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
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
        results = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            batch_results = [self.embed_text(text) for text in batch]
            results.extend(batch_results)
            
        return results