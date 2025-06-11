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
- **Process**:
  ```javascript
  async startAgent(req, res) {
    try {
      const userId = req.userId;
      // CRITICAL: This calls the WRONG method name
      const result = await this.agentService.startAgent(userId);
      // Should be: this.agentService.createAgentSession(userId)
    } catch (error) {
      // Error handling
    }
  }
  ```

#### **🚨 CRITICAL ISSUE #1: Method Name Mismatch**
- **Problem**: `AgentLifecycleOperations.startAgent()` calls `this.agentService.startAgent(userId)`
- **Reality**: `AgentService` only has `createAgentSession()` method
- **Result**: `startAgent is not a function` error

#### **Step 8: Agent Service (If Fixed)**
- **File**: `backend/agent_utils/core/agentService.js`
- **Method**: `createAgentSession(userId, status, sessionData)`
- **Process**:
  ```javascript
  async createAgentSession(userId, status = 'initializing', sessionData = {}) {
    // Calls Supabase RPC
    const { data, error } = await this.supabaseClient
      .rpc('create_agent_session', {
        user_uuid: userId,
        initial_status: status,
        initial_session_data: sessionData
      });
    return data;
  }
  ```

#### **Step 9: Database RPC Call**
- **Function**: `public.create_agent_session(user_uuid, initial_status, initial_session_data)`
- **Process**: Creates agent session in database
- **Returns**: Agent session data

---

## 🔄 **2. Agent Status Check Flow - Automatic Health Monitoring**

### **Frontend Auto-Check Flow**

#### **Step 1: Component Mount (Chat Page)**
- **File**: `frontend/src/pages/Chat.tsx`
- **Hook**: `useEffect()` on component mount
- **Process**:
  ```typescript
  useEffect(() => {
    const checkTxAgentConnection = async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const statusData = await response.json();
      setTxAgentStatus(statusData);
    };
    checkTxAgentConnection();
  }, [session, user]);
  ```

#### **Step 2: useAgents Hook Auto-Refresh**
- **File**: `frontend/src/hooks/useAgents.ts`
- **Function**: `fetchAgentStatus()`
- **Frequency**: Called on mount and manually
- **Process**:
  ```typescript
  const fetchAgentStatus = useCallback(async (silent = false) => {
    const data = await apiCall('/api/agent/status');
    setAgentStatus(data);
    return data;
  }, [apiCall]);
  ```

### **Backend Status Check Flow**

#### **Step 3: Status Route**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Route**: `GET /api/agent/status`
- **Handler**: `AgentStatusOperations.getStatus()`

#### **Step 4: Agent Status Operations**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Class**: `AgentStatusOperations`
- **Method**: `getStatus(req, res)`
- **Process**:
  ```javascript
  async getStatus(req, res) {
    try {
      const userId = req.userId;
      const agent = await this.agentService.getActiveAgent(userId);
      
      if (!agent) {
        return res.json({
          agent_active: false,
          agent_id: null,
          container_status: 'stopped'
        });
      }
      
      // Check container health
      const containerHealth = await this.checkContainerHealth(agent);
      
      res.json({
        agent_active: true,
        agent_id: agent.id,
        container_status: containerHealth.status,
        container_health: containerHealth.data
      });
    } catch (error) {
      // Error handling
    }
  }
  ```

#### **Step 5: Container Health Check**
- **File**: `backend/agent_utils/routes/agentRoutes.js`
- **Method**: `checkContainerHealth(agent)`
- **Process**:
  ```javascript
  async checkContainerHealth(agent) {
    try {
      const healthUrl = `${agent.session_data.runpod_endpoint}/health`;
      const response = await fetch(healthUrl, { timeout: 5000 });
      return {
        status: response.ok ? 'running' : 'unhealthy',
        data: await response.json()
      };
    } catch (error) {
      return {
        status: 'unreachable',
        data: { error: error.message }
      };
    }
  }
  ```

---

## 🔄 **3. Detailed Status Check Flow - Manual Testing**

### **Frontend Detailed Check**
- **File**: `frontend/src/hooks/useAgents.ts`
- **Function**: `performDetailedStatusCheck()`
- **Triggers**: Manual "Test Connection" button
- **Process**: Tests health, chat, and embed endpoints

### **Backend Detailed Check**
- **Route**: `POST /api/agent/health-check`
- **Process**: Comprehensive endpoint testing

---

## 🚨 **IDENTIFIED CONFLICTS AND ISSUES**

### **Issue #1: Method Name Mismatch**
- **Location**: `backend/agent_utils/routes/agentRoutes.js`
- **Problem**: `AgentLifecycleOperations.startAgent()` calls `this.agentService.startAgent(userId)`
- **Reality**: `AgentService` only has `createAgentSession()` method
- **Impact**: "startAgent is not a function" error

### **Issue #2: Duplicate Route Mounting**
- **Location**: `backend/routes/index.js` and `backend/agent_utils/index.js`
- **Problem**: Potential route conflicts between:
  - `/api/agent/*` (new agent routes)
  - `/agent/*` (legacy routes)
  - `/api/chat` (chat routes)
  - `/api/openai-chat` (OpenAI routes)

### **Issue #3: Authentication Middleware Order**
- **Location**: Various route files
- **Problem**: `verifyToken` middleware may not be applied consistently
- **Impact**: Some requests may fail authentication

### **Issue #4: Container Health Check Logic**
- **Location**: `backend/agent_utils/routes/agentRoutes.js`
- **Problem**: Health check assumes `agent.session_data.runpod_endpoint` exists
- **Impact**: May fail if session data is incomplete

---

## 🔧 **PROPOSED SOLUTIONS**

### **Solution #1: Fix Method Name Mismatch**
```javascript
// In AgentLifecycleOperations.startAgent()
// CHANGE FROM:
const result = await this.agentService.startAgent(userId);

// CHANGE TO:
const sessionData = {}; // or relevant data
const result = await this.agentService.createAgentSession(userId, 'initializing', sessionData);
```

### **Solution #2: Add Alias Method to AgentService**
```javascript
// In backend/agent_utils/core/agentService.js
async startAgent(userId) {
  return this.createAgentSession(userId, 'initializing', {});
}
```

### **Solution #3: Consolidate Route Mounting**
```javascript
// In backend/routes/index.js - ensure clear route hierarchy
app.use('/api/agent', agentRouter);     // New agent management
app.use('/api', chatRouter);            // Chat endpoints
app.use('/agent', legacyAgentRouter);   // Legacy (deprecated)
```

### **Solution #4: Fix Container Health Check**
```javascript
async checkContainerHealth(agent) {
  // Validate session data first
  if (!agent.session_data?.runpod_endpoint) {
    return {
      status: 'no_endpoint',
      data: { error: 'No RunPod endpoint configured' }
    };
  }
  
  try {
    const healthUrl = `${agent.session_data.runpod_endpoint}/health`;
    const response = await fetch(healthUrl, { timeout: 5000 });
    return {
      status: response.ok ? 'running' : 'unhealthy',
      data: await response.json()
    };
  } catch (error) {
    return {
      status: 'unreachable',
      data: { error: error.message }
    };
  }
}
```

---

## 🎯 **DEBUGGING CHECKLIST**

### **To Verify Agent Activation Works:**
1. ✅ Check browser network tab for `/api/agent/start` request
2. ✅ Check backend logs for "Agent session created successfully"
3. ✅ Check database for new agent record
4. ✅ Check container logs for health check requests
5. ✅ Verify frontend state updates correctly

### **To Verify Status Checks Work:**
1. ✅ Check browser network tab for `/api/agent/status` requests
2. ✅ Check backend logs for status check operations
3. ✅ Check container health endpoint responses
4. ✅ Verify UI status indicators update correctly

### **Common Failure Points:**
- ❌ Method name mismatch (`startAgent` vs `createAgentSession`)
- ❌ Missing authentication tokens
- ❌ Route conflicts or incorrect mounting
- ❌ Container endpoint not configured
- ❌ Database RPC function errors
- ❌ Network connectivity issues

---

## 🚀 **IMMEDIATE ACTION ITEMS**

1. **Fix Method Name**: Update `AgentLifecycleOperations.startAgent()` to call correct method
2. **Add Logging**: Enhance logging in agent routes for better debugging
3. **Validate Routes**: Ensure no route conflicts exist
4. **Test Flow**: Manually test complete activation flow
5. **Monitor Logs**: Check both backend and container logs during activation

This routing analysis should help identify exactly where the activation flow is breaking and provide clear solutions to fix the issues.