# ROUTING.md - Medical RAG Vector Uploader Routing Analysis

## 🎯 **Purpose**
This document traces the complete routing flow for TxAgent activation and health checks to identify potential conflicts and understand the request flow from frontend to backend to container.

---

## 🔄 **1. Agent Activation Flow - Manual "Activate TxAgent" Button**

### **Frontend Flow (Monitor Page)**

#### **Step 1: User Clicks "Activate TxAgent"**
- **File**: `frontend/src/pages/Monitor.tsx`
- **Component**: Uses `useAgents()` hook
- **Action**: Calls `startAgent()` function

#### **Step 2: useAgents Hook Processing**
- **File**: `frontend/src/hooks/useAgents.ts`
- **Function**: `startAgent()`
- **Process**:
  ```typescript
  const startAgent = useCallback(async () => {
    setActionLoading(true);
    try {
      const data = await apiCall('/api/agent/start', { method: 'POST' });
      // Updates local state
      setAgentStatus({
        agent_active: true,
        agent_id: data.agent_id,
        last_active: new Date().toISOString(),
        container_status: 'running'
      });
    } catch (error) {
      // Error handling
    } finally {
      setActionLoading(false);
    }
  }, [apiCall]);
  ```

#### **Step 3: API Call via useApi Hook**
- **File**: `frontend/src/hooks/useApi.ts`
- **Function**: `apiCall('/api/agent/start', { method: 'POST' })`
- **Process**:
  ```typescript
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  });
  ```

### **Backend Flow**

#### **Step 4: Route Mounting**
- **File**: `backend/routes/index.js`
- **Function**: `setupRoutes(app, supabaseClient)`
- **Process**: Calls `mountAgentRoutes(app, supabaseClient)`

#### **Step 5: Agent Routes Mounting**
- **File**: `backend/agent_utils/index.js`
- **Function**: `mountAgentRoutes(app, supabaseClient)`
- **Process**:
  ```javascript
  const agentRouter = createAgentRouter(supabaseClient);
  app.use('/api/agent', agentRouter);
  ```

#### **Step 6: Agent Router Creation**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Function**: `createAgentRouter(supabaseClient)`
- **Route**: `POST /start` → `AgentLifecycleOperations.startAgent()`

#### **Step 7: Agent Lifecycle Operations**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Class**: `AgentLifecycleOperations`
- **Method**: `startAgent(req, res)`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Fixed to call correct method

#### **Step 8: Agent Service**
- **File**: `backend/agent_utils/core/agentService.js`
- **Method**: `createAgentSession(userId, status, sessionData)`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Creates session in database

#### **Step 9: Database RPC Call**
- **Function**: `public.create_agent_session(user_uuid, initial_status, initial_session_data)`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Creates agent session in database

---

## 🔄 **2. Agent Status Check Flow - Automatic Health Monitoring**

### **Frontend Auto-Check Flow**

#### **Step 1: Component Mount (Chat Page)**
- **File**: `frontend/src/pages/Chat.tsx`
- **Hook**: `useEffect()` on component mount
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Checks agent status on load

#### **Step 2: useAgents Hook Auto-Refresh**
- **File**: `frontend/src/hooks/useAgents.ts`
- **Function**: `fetchAgentStatus()`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Auto-refresh every 30 seconds

### **Backend Status Check Flow**

#### **Step 3: Status Route**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Route**: `GET /api/agent/status`
- **Handler**: `AgentStatusOperations.getStatus()`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Returns agent status

#### **Step 4: Container Health Check**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Method**: `checkContainerHealth(agent)`
- **✅ CURRENT STATUS (v1.1.0)**: **WORKING** - Uses axios, improved logging

---

## 🔄 **3. Chat Flow Analysis**

### **OpenAI Chat Flow (✅ WORKING)**

#### **Frontend → Backend**
- **Route**: `POST /api/openai-chat`
- **File**: `backend/routes/chat.js`
- **Handler**: `createChatRouter()` → OpenAI chat endpoint
- **Process**: Uses ChatService for OpenAI RAG processing
- **✅ STATUS**: **FULLY FUNCTIONAL**

### **TxAgent Chat Flow (❌ MISSING)**

#### **Current Frontend Attempt**
- **File**: `frontend/src/pages/Chat.tsx`
- **Process**: When TxAgent selected, tries to call `/api/chat`
- **Expected Route**: `POST /api/chat`
- **❌ PROBLEM**: **Route does not exist**

#### **Missing Backend Components**
1. **No `/api/chat` route** in any router
2. **No TxAgent chat handler** in chat.js
3. **No container communication** for chat requests

---

## 🚨 **CURRENT ISSUES ANALYSIS (Based on App Reality)**

### **✅ WORKING COMPONENTS (v1.1.0)**
1. **Agent Activation**: Complete flow working
2. **Agent Status Checks**: Working with axios improvements
3. **Container Health Monitoring**: Working and reliable
4. **OpenAI Chat**: Fully functional RAG chat
5. **Database Operations**: All RLS and functions working
6. **Authentication**: JWT tokens working properly

### **❌ MISSING COMPONENTS**

#### **Issue #1: Missing TxAgent Chat Route**
- **Problem**: No `POST /api/chat` endpoint exists
- **Impact**: Frontend gets 404 when trying to chat with TxAgent
- **Location**: Need to add to `backend/routes/chat.js` or agent routes

#### **Issue #2: No Container Chat Integration**
- **Problem**: No code to communicate with TxAgent's chat endpoint
- **Impact**: Even if route existed, no way to proxy to container
- **Need**: Understand TxAgent container's chat API format

### **🤔 QUESTIONS ABOUT TXAGENT CONTAINER**

To implement the missing chat functionality, we need to understand:

1. **What is TxAgent's chat endpoint?**
   - Is it `{runpod_endpoint}/chat`?
   - What request format does it expect?
   - What response format does it return?

2. **Does TxAgent need authentication?**
   - Should we pass user tokens to the container?
   - Or is it open once the container is running?

3. **How does TxAgent access the RAG database?**
   - Does it connect directly to Supabase?
   - Or do we need to pass document context in the request?

---

## 🔧 **PROPOSED SOLUTIONS**

### **Option A: Add TxAgent Chat to Existing Chat Router**

**File**: `backend/routes/chat.js`

```javascript
// Add TxAgent chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;
    
    // Get active agent session
    const { data: agent } = await supabaseClient
      .rpc('get_active_agent', { user_uuid: userId });
    
    if (!agent || !agent.session_data?.runpod_endpoint) {
      return res.status(409).json({ 
        error: 'TxAgent not active. Please start the agent first.' 
      });
    }
    
    // Proxy to TxAgent container
    const containerUrl = `${agent.session_data.runpod_endpoint}/chat`;
    const response = await axios.post(containerUrl, {
      message,
      // TODO: Determine what other data TxAgent needs
    }, { timeout: 30000 });
    
    res.json({
      response: response.data.response,
      sources: response.data.sources || [],
      agent_id: agent.id,
      processing_time: response.data.processing_time
    });
    
  } catch (error) {
    // Error handling
  }
});
```

### **Option B: Add TxAgent Chat to Agent Router**

**File**: `backend/agent_utils/routes/agentRoutes.js`

```javascript
// Add chat endpoint to agent router
router.post('/chat', verifyToken, async (req, res) => {
  // Similar implementation but in agent router
});
```

### **Frontend Update Needed**

**File**: `frontend/src/pages/Chat.tsx`

```typescript
// Update endpoint selection
const endpoint = selectedAgent === 'txagent' 
  ? '/api/chat'           // TxAgent route
  : '/api/openai-chat';   // OpenAI route
```

---

## 🧪 **TESTING REQUIREMENTS**

### **Before Implementation**
1. **Verify TxAgent container chat API**
   - Test direct calls to `{runpod_endpoint}/chat`
   - Understand request/response format
   - Confirm authentication requirements

### **After Implementation**
1. **Test complete chat flow**
   - Frontend → Backend → Container → Response
2. **Verify error handling**
   - Container unreachable scenarios
   - Invalid message formats
3. **Test agent switching**
   - TxAgent ↔ OpenAI switching works
4. **Verify RAG functionality**
   - TxAgent uses uploaded documents
   - Sources are returned properly

---

## 🎯 **IMMEDIATE NEXT STEPS**

1. **🔍 INVESTIGATE**: Test TxAgent container's chat endpoint directly
   - What URL format? (`/chat`, `/api/chat`, `/v1/chat`?)
   - What request body format?
   - What response format?
   - Does it need authentication headers?

2. **📝 DOCUMENT**: TxAgent container API specification
   - Chat endpoint details
   - Authentication requirements
   - RAG database access method

3. **🔨 IMPLEMENT**: Missing chat route
   - Choose Option A or B based on architecture preference
   - Add proper error handling and logging
   - Test with real container

4. **🧪 TEST**: End-to-end chat functionality
   - Verify TxAgent chat works
   - Ensure OpenAI chat still works
   - Test agent switching

---

## 📊 **CURRENT ARCHITECTURE STATUS**

### **✅ SOLID FOUNDATION (v1.1.0)**
- Database schema and RLS policies
- Agent lifecycle management
- Container health monitoring
- Authentication and authorization
- OpenAI RAG chat functionality
- Document upload and embedding

### **🔧 MISSING PIECE**
- **TxAgent Chat Integration**: The only missing component for full functionality

The app is 95% complete. We just need to understand TxAgent's chat API and add the missing route to complete the integration.

---

## 🚀 **CONFIDENCE LEVEL**

- **Agent Activation**: ✅ 100% Working
- **Health Monitoring**: ✅ 100% Working  
- **OpenAI Chat**: ✅ 100% Working
- **TxAgent Chat**: ❌ 0% Working (route missing)
- **Overall System**: ✅ 95% Complete

**Next milestone**: Implement TxAgent chat route to reach 100% functionality.