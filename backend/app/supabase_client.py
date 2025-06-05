import os
import logging
from supabase import create_client, Client
from typing import Dict, List, Any, Optional
import json

logger = logging.getLogger(__name__)

class SupabaseClient:
    """Client for interacting with Supabase for storage and database operations."""
    
    def __init__(self):
        """Initialize the Supabase client with environment variables."""
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_KEY")
        self.bucket = os.getenv("SUPABASE_BUCKET", "documents")
        
        if not self.url or not self.key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
        
        # Initialize Supabase client
        self.client: Client = create_client(self.url, self.key)
        logger.info(f"Initialized Supabase client for {self.url}")
        
        # Ensure bucket exists
        self._ensure_bucket_exists()
        
    def _ensure_bucket_exists(self):
        """Create the storage bucket if it doesn't exist."""
        try:
            # Check if bucket exists by listing
            self.client.storage.get_bucket(self.bucket)
            logger.info(f"Bucket '{self.bucket}' already exists")
        except Exception:
            # Create bucket if it doesn't exist
            self.client.storage.create_bucket(self.bucket, options={'public': False})
            logger.info(f"Created storage bucket '{self.bucket}'")
    
    def is_connected(self) -> bool:
        """Check if the Supabase client is connected."""
        try:
            # Simple query to check connection
            self.client.table("documents").select("id").limit(1).execute()
            return True
        except Exception as e:
            logger.error(f"Supabase connection check failed: {str(e)}")
            return False
    
    def upload_file(self, path: str, content_bytes: bytes) -> str:
        """
        Upload a file to Supabase Storage.
        
        Args:
            path: The storage path including any folders
            content_bytes: The file content as bytes
            
        Returns:
            The public URL of the uploaded file
        """
        try:
            # Upload the file
            response = self.client.storage.from_(self.bucket).upload(
                path,
                content_bytes,
                file_options={"content-type": "application/octet-stream"}
            )
            
            logger.info(f"Uploaded file to {path}")
            
            # Return the path or URL
            return self.client.storage.from_(self.bucket).get_public_url(path)
        except Exception as e:
            logger.error(f"Error uploading file: {str(e)}")
            raise
    
    def insert_document(
        self, 
        document_id: str, 
        filename: str, 
        content: str, 
        metadata: Dict[str, Any], 
        embedding: List[float],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Insert a document and its embedding into the documents table.
        
        Args:
            document_id: UUID for the document
            filename: Original filename
            content: Extracted text content
            metadata: Document metadata (e.g., page count, author)
            embedding: Vector embedding from the model
            user_id: UUID of the authenticated user
            
        Returns:
            The inserted record
        """
        try:
            # Create the document record
            data = {
                "id": document_id,
                "filename": filename,
                "content": content,
                "metadata": metadata,
                "embedding": embedding,
                "user_id": user_id
            }
            
            # Insert into the documents table
            response = self.client.table("documents").insert(data).execute()
            
            logger.info(f"Inserted document with ID {document_id}")
            return response.data[0] if response.data else {}
            
        except Exception as e:
            logger.error(f"Error inserting document: {str(e)}")
            raise
    
    def search_similar_documents(
        self, 
        query_embedding: List[float], 
        limit: int = 5, 
        threshold: float = 0.7,
        user_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Search for documents similar to the query embedding.
        
        Args:
            query_embedding: The vector embedding to search against
            limit: Maximum number of results to return
            threshold: Minimum similarity score (0-1)
            user_id: UUID of the authenticated user to filter results
            
        Returns:
            List of similar documents with similarity scores
        """
        try:
            # Execute the similarity search query
            query = self.client.rpc(
                "match_documents",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": threshold,
                    "match_count": limit
                }
            )
            
            # Add user_id filter if provided
            if user_id:
                query = query.eq("user_id", user_id)
            
            response = query.execute()
            return response.data
            
        except Exception as e:
            logger.error(f"Error searching documents: {str(e)}")
            raise