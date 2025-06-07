# TxAgent Container Troubleshooting Guide - Updated

## Current Status Summary

### ✅ What's Working
- **Container Health**: `/health` endpoint responds correctly with BioBERT model info
- **Network Connectivity**: Container is reachable from Node.js backend
- **CORS**: Fixed to allow WebContainer domains
- **OpenAI Fallback**: Working perfectly as backup system
- **POST Method Detection**: Container correctly rejects GET requests to POST endpoints with 405

### ❌ What's Failing
- **JWT Audience Validation**: Container rejecting Supabase JWT tokens due to "Invalid audience" error
- **Authentication**: All authenticated endpoints failing due to JWT validation

## Root Cause Analysis

Based on the container logs, the issue is **JWT audience validation**:

```
❌ JWT InvalidTokenError: Invalid audience
```

The Supabase JWT token contains:
```json
{
  "aud": "authenticated",
  "iss": "https://bfjfjxzdjhraabputkqi.supabase.co/auth/v1",
  "sub": "496a7180-5e75-42b0-8a61-b8cf92ffe286",
  "role": "authenticated"
}
```

But the TxAgent container's JWT validation is not configured to accept `"authenticated"` as a valid audience.

## Required Fix for TxAgent Container

### Update JWT Validation in `hybrid-agent/auth.py`

The container needs this specific change:

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
        
        # CRITICAL FIX: Add audience="authenticated" for Supabase tokens
        decoded_token = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",  # <-- THIS IS THE KEY FIX
            issuer=os.getenv('SUPABASE_URL', '').rstrip('/') + '/auth/v1',
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

## Client-Side Verification ✅ CONFIRMED

Our Node.js backend and React frontend are correctly using POST methods:

### Backend (`runpodService.js`):
```javascript
// ✅ Correctly using POST for chat
const response = await axios.post(
  `${process.env.RUNPOD_EMBEDDING_URL}/chat`,
  requestPayload,
  { 
    headers: { 
      'Authorization': userJWT,
      'Content-Type': 'application/json'
    },
    timeout: this.chatTimeout
  }
);

// ✅ Correctly using POST for embed
const response = await axios.post(
  `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
  requestPayload,
  { 
    headers: { 
      'Authorization': userJWT,
      'Content-Type': 'application/json'
    },
    timeout: this.defaultTimeout
  }
);
```

### Frontend (`Chat.tsx`):
```javascript
// ✅ Correctly using POST for chat
const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
  method: 'POST', // Explicitly specified
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ 
    message: messageContent,
    context: messages.slice(-5)
  }),
});
```

## Environment Variables Required

Ensure these are set in the TxAgent container:

```bash
SUPABASE_URL=https://bfjfjxzdjhraabputkqi.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-here  # CRITICAL for JWT validation
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Testing Plan

### 1. Test Current Behavior (Should Fail)
```bash
# This should return 401 due to JWT audience validation
curl -X POST https://bjo5yophw94s7b-8000.proxy.runpod.net/chat \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Ilk5bUtXRE0wLzl4SU1aSVgiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2JmamZqeHpkamhyYWFicHV0a3FpLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0OTZhNzE4MC01ZTc1LTQyYjAtOGE2MS1iOGNmOTJmZmUyODYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ5MzMwOTMwLCJpYXQiOjE3NDkzMjczMzAsImVtYWlsIjoiZ3JlZ2NiYXJrZXJAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImdyZWdjYmFya2VyQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjQ5NmE3MTgwLTVlNzUtNDJiMC04YTYxLWI4Y2Y5MmZmZTI4NiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzQ5MzIxMTkwfV0sInNlc3Npb25faWQiOiI5MGY5Y2M1NS05OTg3LTRhNTQtOGQ0OS0zYmIwYjk5ZTVhNTciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.bXcfdKHQrA_RHwOQwHK5OXgYxF1iQmpj_5dRDivUATU" \
  -H "Content-Type: application/json" \
  -d '{"query": "test message"}'
```

### 2. After JWT Fix (Should Work)
Same command should return 200 with chat response.

### 3. Verify GET Still Returns 405 (Correct Behavior)
```bash
# This should still return 405 - this is correct
curl -X GET https://bjo5yophw94s7b-8000.proxy.runpod.net/chat \
  -H "Authorization: Bearer [token]"
```

## Expected Results After Fix

- ✅ POST `/chat` with valid JWT returns 200 with chat response
- ✅ POST `/embed` with valid JWT returns 200/202 with job info
- ✅ Invalid JWT returns 401 with clear error message
- ✅ GET requests to POST endpoints still return 405 (correct behavior)
- ✅ Health endpoint continues to work without authentication

## Implementation Steps

1. **Update `hybrid-agent/auth.py`** with the JWT audience fix
2. **Rebuild the TxAgent container** with the updated code
3. **Test with the updated Postman collection**
4. **Verify end-to-end flow** from frontend through backend to container

## Success Criteria

- [ ] JWT tokens with `"aud": "authenticated"` are accepted
- [ ] POST `/chat` endpoint works with authentication
- [ ] POST `/embed` endpoint works with authentication
- [ ] Container logs show "✅ JWT validation successful"
- [ ] Frontend chat interface connects to TxAgent successfully
- [ ] Document embedding through TxAgent works
- [ ] Agent status shows "ACTIVE" in Monitor page

The fix is straightforward - just adding `audience="authenticated"` to the JWT decode call in the container's authentication code.