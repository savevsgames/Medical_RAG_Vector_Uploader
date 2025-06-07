# TxAgent Container JWT Audience Fix

## Problem Analysis

Based on the container logs, we have identified two key issues:

1. **JWT Audience Validation Error**: The TxAgent container is rejecting Supabase JWT tokens due to an "Invalid audience" error
2. **GET requests to POST endpoints**: Some requests are being sent as GET instead of POST to the `/chat` endpoint

## JWT Token Analysis

From the logs, the Supabase JWT contains:
```json
{
  "aud": "authenticated",
  "iss": "https://bfjfjxzdjhraabputkqi.supabase.co/auth/v1",
  "sub": "496a7180-5e75-42b0-8a61-b8cf92ffe286",
  "role": "authenticated"
}
```

The container's JWT validation is failing because it's not configured to accept `"authenticated"` as a valid audience.

## Required Changes for TxAgent Container

### 1. Update JWT Validation in `hybrid-agent/auth.py`

The container's JWT validation needs to be updated to accept the correct audience:

```python
import jwt
from jwt.exceptions import InvalidAudienceError, ExpiredSignatureError, DecodeError
from fastapi import HTTPException
import os
import logging

logger = logging.getLogger(__name__)

def validate_token(token: str) -> dict:
    """
    Validate Supabase JWT token with correct audience handling
    """
    try:
        secret = os.getenv('SUPABASE_JWT_SECRET')
        if not secret:
            raise HTTPException(status_code=500, detail="JWT secret not configured")
        
        # Decode with explicit audience validation for Supabase tokens
        decoded_token = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",  # Supabase uses "authenticated" as audience
            issuer=os.getenv('SUPABASE_URL', '').rstrip('/') + '/auth/v1',  # Validate issuer too
            options={
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
                "verify_signature": True
            }
        )
        
        logger.info(f"✅ JWT validation successful for user: {decoded_token.get('sub')}")
        return decoded_token
        
    except InvalidAudienceError as e:
        logger.error(f"❌ JWT Invalid Audience: {e}")
        raise HTTPException(status_code=401, detail="Invalid token: Audience mismatch")
    except ExpiredSignatureError as e:
        logger.error(f"❌ JWT Expired: {e}")
        raise HTTPException(status_code=401, detail="Invalid token: Token expired")
    except DecodeError as e:
        logger.error(f"❌ JWT Decode Error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token: Could not decode")
    except Exception as e:
        logger.error(f"❌ JWT Validation Error: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
```

### 2. Update Main FastAPI App in `hybrid-agent/main.py`

Ensure the authentication middleware is properly configured:

```python
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging
from .auth import validate_token

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TxAgent Hybrid Container", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Extract and validate user from JWT token
    """
    token = credentials.credentials
    user_data = validate_token(token)
    return user_data

@app.post("/chat")
async def chat_endpoint(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Chat endpoint - ONLY accepts POST requests
    """
    user_id = current_user.get('sub')
    logger.info(f"🗣️ Chat request from user: {user_id}")
    
    # Your existing chat logic here
    # ...
    
    return {
        "response": "Chat response here",
        "sources": [],
        "status": "success"
    }

@app.post("/embed")
async def embed_endpoint(
    request: EmbedRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Embed endpoint - ONLY accepts POST requests
    """
    user_id = current_user.get('sub')
    logger.info(f"📄 Embed request from user: {user_id}")
    
    # Your existing embed logic here
    # ...
    
    return {
        "job_id": "some-job-id",
        "status": "pending"
    }
```

## Client-Side Verification

Let me verify that our Node.js backend and React frontend are correctly using POST methods.

## Environment Variables Required

Ensure these environment variables are set in the TxAgent container:

```bash
SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-here
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Testing Steps

1. Rebuild the TxAgent container with the updated JWT validation
2. Test with the provided Postman collection
3. Verify that POST requests to `/chat` and `/embed` work correctly
4. Confirm that authentication passes with Supabase JWT tokens

## Expected Results

After implementing these changes:
- ✅ JWT tokens with `"aud": "authenticated"` will be accepted
- ✅ POST requests to `/chat` will work correctly
- ✅ POST requests to `/embed` will work correctly
- ✅ Authentication will pass for valid Supabase users
- ❌ GET requests to POST-only endpoints will still return 405 (this is correct behavior)