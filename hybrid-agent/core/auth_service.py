import os
import jwt
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

from core.exceptions import AuthenticationError

logger = logging.getLogger("auth_service")

# Security scheme
security = HTTPBearer()

class AuthService:
    """Centralized authentication service for TxAgent"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
        self.jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
        
        if not all([self.supabase_url, self.supabase_anon_key, self.jwt_secret]):
            raise ValueError("Missing required Supabase configuration")
        
        logger.info("✅ AuthService initialized")
    
    def validate_token(self, token: str) -> Dict[str, Any]:
        """Validate JWT token and extract user information"""
        try:
            logger.info("🔍 VALIDATE_TOKEN: Starting token validation")
            
            # Decode and validate JWT
            payload = self._decode_jwt(token)
            
            # Extract user information
            user_id = payload.get("sub")
            email = payload.get("email")
            role = payload.get("role")
            
            if not user_id:
                raise AuthenticationError("Token missing user ID")
            
            if role != "authenticated":
                raise AuthenticationError("Invalid user role")
            
            user_info = {
                "user_id": user_id,
                "email": email,
                "role": role,
                "payload": payload
            }
            
            logger.info(f"✅ VALIDATE_TOKEN: Token validation successful for user: {user_id}")
            return user_info
            
        except jwt.InvalidTokenError as e:
            logger.error(f"❌ VALIDATE_TOKEN: JWT validation failed: {str(e)}")
            raise AuthenticationError(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"❌ VALIDATE_TOKEN: Unexpected error: {str(e)}")
            raise AuthenticationError(f"Token validation failed: {str(e)}")
    
    def _decode_jwt(self, token: str) -> Dict[str, Any]:
        """Decode and validate JWT token"""
        try:
            logger.info("🔍 DECODE_JWT: Starting JWT validation")
            logger.info(f"🔍 DECODE_JWT: Token length: {len(token)}")
            
            # Decode without verification first to inspect
            unverified = jwt.decode(token, options={"verify_signature": False})
            logger.info(f"🔍 DECODE_JWT: Token payload preview: {list(unverified.keys())}")
            
            # Check expiration
            exp = unverified.get("exp")
            if exp:
                exp_time = datetime.fromtimestamp(exp)
                time_until_exp = (exp_time - datetime.now()).total_seconds()
                logger.info(f"⏰ DECODE_JWT: Time until expiration: {time_until_exp} seconds")
                
                if time_until_exp <= 0:
                    raise jwt.ExpiredSignatureError("Token has expired")
            
            # Perform verified decode
            logger.info("🔍 DECODE_JWT: Performing verified decode")
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                audience="authenticated"
            )
            
            logger.info("✅ DECODE_JWT: Token validation successful")
            logger.info(f"✅ DECODE_JWT: User ID: {payload.get('sub')}")
            
            return payload
            
        except jwt.ExpiredSignatureError:
            logger.error("❌ DECODE_JWT: Token has expired")
            raise
        except jwt.InvalidAudienceError:
            logger.error("❌ DECODE_JWT: Invalid token audience")
            raise
        except jwt.InvalidSignatureError:
            logger.error("❌ DECODE_JWT: Invalid token signature")
            raise
        except Exception as e:
            logger.error(f"❌ DECODE_JWT: Unexpected error: {str(e)}")
            raise

def get_supabase_client(user_id: str = None) -> Client:
    """Get authenticated Supabase client"""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_anon_key:
        raise ValueError("Missing Supabase configuration")
    
    return create_client(supabase_url, supabase_anon_key)

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """FastAPI dependency to get current authenticated user"""
    try:
        # Get auth service from app state
        auth_service = request.app.state.auth_service
        
        # Validate token
        user_info = auth_service.validate_token(credentials.credentials)
        
        logger.info(f"✅ Successfully authenticated user: {user_info['user_id']}")
        return user_info
        
    except AuthenticationError as e:
        logger.warning(f"🔒 Authentication failed: {e.message}")
        raise HTTPException(status_code=401, detail=e.message)
    except Exception as e:
        logger.error(f"❌ Authentication error: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")

# Optional dependency for endpoints that don't require auth
async def get_current_user_optional(
    request: Request
) -> Optional[Dict[str, Any]]:
    """Optional authentication dependency"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.info("ℹ️ No Authorization header found or invalid format")
            return None
        
        token = auth_header.split(" ")[1]
        auth_service = request.app.state.auth_service
        
        user_info = auth_service.validate_token(token)
        logger.info(f"✅ Successfully authenticated user: {user_info['user_id']}")
        return user_info
        
    except Exception as e:
        logger.info(f"ℹ️ Optional authentication failed: {str(e)}")
        return None