import express from "express";
import axios from "axios";
import { AgentService } from "../core/agentService.js";
import { verifyToken } from "../../middleware/auth.js";
import { errorLogger } from "../shared/logger.js";

export function createAgentRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    throw new Error("Invalid Supabase client provided to createAgentRouter");
  }

  const router = express.Router();

  // Apply authentication to all agent routes
  router.use(verifyToken);

  // Initialize services with injected Supabase client
  const agentService = new AgentService(supabaseClient);

  // Agent Status Operations
  class AgentStatusOperations {
    constructor(agentService) {
      this.agentService = agentService;
    }

    async getStatus(req, res) {
      const startTime = Date.now();

      try {
        const userId = req.userId;

        errorLogger.info("Agent status request received", {
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent")?.substring(0, 100),
          component: "AgentStatusOperations",
        });

        // Get active agent from database
        const agent = await this.agentService.getActiveAgent(userId);

        if (!agent) {
          errorLogger.info("No active agent found for user", {
            userId,
            component: "AgentStatusOperations",
          });

          return res.json({
            agent_active: false,
            agent_id: null,
            last_active: null,
            container_status: "stopped",
            container_health: null,
            session_data: null,
          });
        }

        errorLogger.info("Active agent found", {
          userId,
          agentId: agent.id,
          agentStatus: agent.status,
          lastActive: agent.last_active,
          hasSessionData: !!agent.session_data,
          runpodEndpoint: agent.session_data?.runpod_endpoint,
          component: "AgentStatusOperations",
        });

        // Check container health if agent is active
        let containerStatus = "unknown";
        let containerHealth = null;

        if (agent.status === "active" || agent.status === "initializing") {
          try {
            // ✅ ENHANCED: Better container health check with detailed logging
            const healthCheck = await this.checkContainerHealth(agent, req.headers.authorization);
            containerStatus = healthCheck.status;
            containerHealth = healthCheck.data;
            
            errorLogger.info("Container health check completed", {
              userId,
              agentId: agent.id,
              containerStatus,
              healthCheckSuccess: healthCheck.status === "running",
              component: "AgentStatusOperations",
            });
          } catch (healthError) {
            errorLogger.warn("Container health check failed", {
              userId,
              agentId: agent.id,
              error: healthError.message,
              errorCode: healthError.code,
              runpodEndpoint: agent.session_data?.runpod_endpoint,
              component: "AgentStatusOperations",
            });
            containerStatus = "unreachable";
            containerHealth = { 
              error: healthError.message,
              code: healthError.code,
              endpoint: agent.session_data?.runpod_endpoint
            };
          }
        }

        const processingTime = Date.now() - startTime;

        const response = {
          agent_active: agent.status === "active",
          agent_id: agent.id,
          last_active: agent.last_active,
          container_status: containerStatus,
          container_health: containerHealth,
          session_data: agent.session_data,
        };

        errorLogger.success("Agent status retrieved successfully", {
          userId,
          agentId: agent.id,
          containerStatus,
          processingTime,
          component: "AgentStatusOperations",
        });

        res.json(response);
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown status error";

        errorLogger.error("Agent status request failed", error, {
          userId: req.userId,
          processingTime,
          error_message: errorMessage,
          error_code: error.code,
          component: "AgentStatusOperations",
        });

        res.status(500).json({
          error: "Failed to get agent status",
          details: errorMessage,
          processing_time_ms: processingTime,
        });
      }
    }

    // ✅ ENHANCED: Better container health check with detailed diagnostics
    async checkContainerHealth(agent, authToken) {
      // Validate session data
      if (!agent.session_data?.runpod_endpoint) {
        throw new Error("No RunPod endpoint configured in session data");
      }

      const baseEndpoint = agent.session_data.runpod_endpoint.replace(/\/+$/, "");
      const healthUrl = `${baseEndpoint}/health`;

      errorLogger.debug("Checking container health with enhanced diagnostics", {
        agentId: agent.id,
        baseEndpoint,
        healthUrl,
        hasAuthToken: !!authToken,
        component: "AgentStatusOperations",
      });

      try {
        // ✅ ENHANCED: More robust health check with better error handling
        const response = await axios.get(healthUrl, {
          timeout: 10000, // Increased timeout
          headers: { 
            Accept: "application/json",
            Authorization: authToken,
            "User-Agent": "Medical-RAG-Backend/1.0"
          },
          validateStatus: function (status) {
            // Accept any status code to get more detailed error info
            return status < 600;
          }
        });

        errorLogger.debug("Health check response received", {
          healthUrl,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers['content-type'],
          dataPreview: typeof response.data === 'string' ? 
            response.data.substring(0, 200) : 
            JSON.stringify(response.data).substring(0, 200),
          hasAuthToken: !!authToken,
          component: "AgentStatusOperations",
        });

        if (response.status === 200) {
          return {
            status: "running",
            data: response.data,
          };
        } else if (response.status === 404) {
          // ✅ SPECIFIC: Handle 404 errors (endpoint not found)
          throw new Error(`TxAgent container health endpoint not found (404). The container may not be properly implementing the /health endpoint.`);
        } else if (response.status === 401 || response.status === 403) {
          // ✅ SPECIFIC: Handle auth errors
          throw new Error(`TxAgent container authentication failed (${response.status}). Check JWT token configuration.`);
        } else {
          // ✅ SPECIFIC: Handle other HTTP errors
          throw new Error(`TxAgent container returned HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        // ✅ ENHANCED: Better error categorization and logging
        let enhancedError = error;
        
        if (error.code === 'ECONNREFUSED') {
          enhancedError = new Error(`TxAgent container connection refused. Container may be down or not accessible at ${healthUrl}`);
          enhancedError.code = 'CONTAINER_UNREACHABLE';
        } else if (error.code === 'ENOTFOUND') {
          enhancedError = new Error(`TxAgent container hostname not found. Check RunPod endpoint URL: ${healthUrl}`);
          enhancedError.code = 'HOSTNAME_NOT_FOUND';
        } else if (error.code === 'ETIMEDOUT') {
          enhancedError = new Error(`TxAgent container health check timed out. Container may be starting or overloaded.`);
          enhancedError.code = 'HEALTH_CHECK_TIMEOUT';
        } else if (error.response?.status === 404) {
          enhancedError = new Error(`TxAgent container /health endpoint not implemented (404). Container needs to implement the health check endpoint.`);
          enhancedError.code = 'HEALTH_ENDPOINT_NOT_FOUND';
        }

        errorLogger.error("Container health check failed with enhanced diagnostics", enhancedError, {
          healthUrl,
          error_code: enhancedError.code || error.code,
          error_status: error.response?.status,
          error_data: error.response?.data,
          error_message: enhancedError.message,
          hasAuthToken: !!authToken,
          containerEndpoint: baseEndpoint,
          component: "AgentStatusOperations",
        });

        return {
          status: "unreachable",
          data: {
            error: enhancedError.message,
            code: enhancedError.code || error.code,
            response_status: error.response?.status,
            endpoint: healthUrl,
            suggestions: this.getHealthCheckSuggestions(enhancedError.code || error.code)
          },
        };
      }
    }

    // ✅ NEW: Provide helpful suggestions based on error type
    getHealthCheckSuggestions(errorCode) {
      switch (errorCode) {
        case 'CONTAINER_UNREACHABLE':
          return [
            'Check if the RunPod container is running',
            'Verify the container endpoint URL is correct',
            'Ensure the container is not in a stopped state'
          ];
        case 'HOSTNAME_NOT_FOUND':
          return [
            'Verify the RunPod endpoint URL is correct',
            'Check if the RunPod proxy URL has changed',
            'Ensure the container is deployed and accessible'
          ];
        case 'HEALTH_CHECK_TIMEOUT':
          return [
            'Container may be starting up - wait a few minutes',
            'Check container resource usage and scaling',
            'Verify container is not overloaded with requests'
          ];
        case 'HEALTH_ENDPOINT_NOT_FOUND':
          return [
            'Container needs to implement GET /health endpoint',
            'Verify container is running the correct TxAgent image',
            'Check container logs for startup errors'
          ];
        default:
          return [
            'Check container logs for errors',
            'Verify container configuration',
            'Try restarting the container'
          ];
      }
    }
  }

  // Agent Lifecycle Operations
  class AgentLifecycleOperations {
    constructor(agentService) {
      this.agentService = agentService;
    }

    async startAgent(req, res) {
      const startTime = Date.now();

      try {
        const userId = req.userId;

        errorLogger.info("Agent start request received", {
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent")?.substring(0, 100),
          component: "AgentLifecycleOperations",
        });

        // CRITICAL: Ensure RUNPOD_EMBEDDING_URL is configured
        if (!process.env.RUNPOD_EMBEDDING_URL) {
          throw new Error(
            "RUNPOD_EMBEDDING_URL is not set in environment variables"
          );
        }

        // ✅ ENHANCED: Validate RunPod endpoint before creating session
        const runpodEndpoint = process.env.RUNPOD_EMBEDDING_URL.replace(/\/+$/, "");
        
        errorLogger.info("Validating RunPod endpoint before agent creation", {
          userId,
          runpodEndpoint,
          component: "AgentLifecycleOperations",
        });

        // Quick connectivity test (optional - can be disabled if causing issues)
        try {
          const testResponse = await axios.get(`${runpodEndpoint}/health`, {
            timeout: 5000,
            headers: {
              Authorization: req.headers.authorization,
              "User-Agent": "Medical-RAG-Backend/1.0"
            },
            validateStatus: () => true // Accept any status for testing
          });
          
          errorLogger.info("RunPod endpoint connectivity test", {
            userId,
            runpodEndpoint,
            testStatus: testResponse.status,
            testStatusText: testResponse.statusText,
            component: "AgentLifecycleOperations",
          });
        } catch (testError) {
          errorLogger.warn("RunPod endpoint connectivity test failed", {
            userId,
            runpodEndpoint,
            testError: testError.message,
            component: "AgentLifecycleOperations",
          });
          // Continue anyway - the test might fail but the container could still work
        }

        // Prepare session data with RunPod endpoint
        const sessionData = {
          runpod_endpoint: runpodEndpoint,
          started_at: new Date().toISOString(),
          capabilities: ["chat", "embed", "health"],
          container_type: "txagent",
          backend_version: "1.0.0"
        };

        errorLogger.info("Starting agent (alias for createAgentSession)", {
          userId,
          sessionData,
          component: "AgentService",
        });

        // FIXED: Call the correct method with proper parameters
        const agent = await this.agentService.createAgentSession(
          userId,
          "initializing",
          sessionData
        );

        if (!agent) {
          throw new Error("Failed to create agent session - no data returned");
        }

        // Update agent status to active
        await this.agentService.updateAgentStatus(agent.id, "active");

        const processingTime = Date.now() - startTime;

        errorLogger.success("Agent session created successfully", {
          userId,
          agentId: agent.id,
          sessionData: agent.session_data,
          processingTime,
          component: "AgentLifecycleOperations",
        });

        res.json({
          success: true,
          agent_id: agent.id,
          status: "active",
          session_data: agent.session_data,
          container_id: agent.session_data?.container_id || null,
          runpod_endpoint: agent.session_data?.runpod_endpoint || null,
          processing_time_ms: processingTime,
          message: "TxAgent session activated successfully",
        });
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        errorLogger.error("Agent start failed", {
          userId: req.userId,
          processingTime,
          error: errorMessage,
          component: "AgentLifecycleOperations",
          error_message: errorMessage,
          error_code: error.code,
        });

        res.status(500).json({
          error: "Failed to start agent session",
          details: errorMessage,
          processing_time_ms: processingTime,
        });
      }
    }

    async stopAgent(req, res) {
      const startTime = Date.now();

      try {
        const userId = req.userId;

        errorLogger.info("Agent stop request received", {
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent")?.substring(0, 100),
          component: "AgentLifecycleOperations",
        });

        // Terminate agent session
        const terminated = await this.agentService.terminateAgentSession(
          userId
        );

        const processingTime = Date.now() - startTime;

        if (terminated) {
          errorLogger.success("Agent session terminated successfully", {
            userId,
            processingTime,
            component: "AgentLifecycleOperations",
          });

          res.json({
            success: true,
            message: "TxAgent session deactivated successfully",
            processing_time_ms: processingTime,
          });
        } else {
          errorLogger.warn("No active agent session found to terminate", {
            userId,
            processingTime,
            component: "AgentLifecycleOperations",
          });

          res.json({
            success: true,
            message: "No active agent session found",
            processing_time_ms: processingTime,
          });
        }
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        errorLogger.error("Agent stop failed", {
          userId: req.userId,
          processingTime,
          error: errorMessage,
          component: "AgentLifecycleOperations",
          error_message: errorMessage,
          error_code: error.code,
        });

        res.status(500).json({
          error: "Failed to stop agent session",
          details: errorMessage,
          processing_time_ms: processingTime,
        });
      }
    }
  }

  // Agent Health Operations
  class AgentHealthOperations {
    constructor(agentService) {
      this.agentService = agentService;
    }

    async performHealthCheck(req, res) {
      const startTime = Date.now();

      try {
        const userId = req.userId;

        errorLogger.info("Detailed health check request received", {
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent")?.substring(0, 100),
          component: "AgentHealthOperations",
        });

        // Get active agent
        const agent = await this.agentService.getActiveAgent(userId);

        if (!agent) {
          return res.status(400).json({
            error: "No active agent session found",
            details: "Start an agent session first",
          });
        }

        // Perform comprehensive health checks
        const healthResults = {
          agent_id: agent.id,
          container_reachable: false,
          jwt_valid: true, // Assume valid if we got here
          endpoints_working: false,
          last_test_time: new Date().toISOString(),
          test_results: {
            health: { status: 0, response: null, error: null },
            chat: { status: 0, response: null, error: null },
            embed: { status: 0, response: null, error: null },
          },
        };

        // Test health endpoint
        try {
          // ✅ FIXED: Pass JWT token to checkContainerHealth
          const healthCheck = await this.checkContainerHealth(agent, req.headers.authorization);
          healthResults.container_reachable = healthCheck.status === "running";
          healthResults.test_results.health.status =
            healthCheck.status === "running" ? 200 : 500;
          healthResults.test_results.health.response = healthCheck.data;
        } catch (error) {
          healthResults.test_results.health.error = error.message;
        }

        // Test other endpoints if health check passed
        if (healthResults.container_reachable) {
          // ✅ FIXED: Test chat endpoint with correct payload format
          try {
            const chatUrl = `${agent.session_data.runpod_endpoint.replace(
              /\/+$/,
              ""
            )}/chat`;
            const { status } = await axios.post(
              chatUrl,
              {
                query: "Test connection", // ✅ FIXED: Use 'query', not 'message'
                top_k: 1,
                temperature: 0.1,
              },
              {
                timeout: 5000,
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: req.headers.authorization, // ✅ ADDED: Pass JWT
                },
              }
            );

            healthResults.test_results.chat.status = status;
            healthResults.endpoints_working = true;
          } catch (error) {
            healthResults.test_results.chat.error = error.message;
          }

          // ✅ FIXED: Test embed endpoint with correct payload format
          try {
            const embedUrl = `${agent.session_data.runpod_endpoint.replace(
              /\/+$/,
              ""
            )}/embed`;
            const { status } = await axios.post(
              embedUrl,
              {
                text: "Test embedding", // ✅ CORRECT: TxAgent expects 'text'
                metadata: {
                  source: "health_check",
                  timestamp: new Date().toISOString(),
                },
              },
              {
                timeout: 5000,
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: req.headers.authorization, // ✅ ADDED: Pass JWT
                },
              }
            );

            healthResults.test_results.embed.status = status;
          } catch (error) {
            healthResults.test_results.embed.error = error.message;
          }
        }

        const processingTime = Date.now() - startTime;

        errorLogger.success("Detailed health check completed", {
          userId,
          agentId: agent.id,
          containerReachable: healthResults.container_reachable,
          endpointsWorking: healthResults.endpoints_working,
          processingTime,
          component: "AgentHealthOperations",
        });

        res.json({
          ...healthResults,
          processing_time_ms: processingTime,
        });
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown health check error";

        errorLogger.error("Detailed health check failed", error, {
          userId: req.userId,
          processingTime,
          error_message: errorMessage,
          error_code: error.code,
          component: "AgentHealthOperations",
        });

        res.status(500).json({
          error: "Health check failed",
          details: errorMessage,
          processing_time_ms: processingTime,
        });
      }
    }

    async checkContainerHealth(agent, authToken) {
      // Reuse the same logic from AgentStatusOperations
      const statusOps = new AgentStatusOperations(this.agentService);
      return statusOps.checkContainerHealth(agent, authToken);
    }
  }

  // Initialize operation classes (❌ REMOVED: containerService parameters)
  const statusOperations = new AgentStatusOperations(agentService);
  const lifecycleOperations = new AgentLifecycleOperations(agentService);
  const healthOperations = new AgentHealthOperations(agentService);

  // ROUTES

  // Agent status endpoint
  router.get("/status", statusOperations.getStatus.bind(statusOperations));

  // Agent lifecycle endpoints
  router.post(
    "/start",
    lifecycleOperations.startAgent.bind(lifecycleOperations)
  );
  router.post("/stop", lifecycleOperations.stopAgent.bind(lifecycleOperations));

  // Agent health endpoints
  router.post(
    "/health-check",
    healthOperations.performHealthCheck.bind(healthOperations)
  );

  // Routes for custom TEST endpoints
  router.post("/test-health", verifyToken, async (req, res) => {
    try {
      if (!process.env.RUNPOD_EMBEDDING_URL) {
        return res.status(503).json({ error: "TxAgent URL not configured" });
      }

      // ✅ FIXED: Include Authorization header with JWT token
      const response = await axios.get(
        `${process.env.RUNPOD_EMBEDDING_URL}/health`,
        {
          timeout: 5000,
          headers: { 
            Accept: "application/json",
            Authorization: req.headers.authorization // ✅ Pass JWT token to container
          },
        }
      );

      res.json({
        status: 200,
        response: response.data,
        endpoint: "/health",
      });
    } catch (error) {
      res.status(500).json({
        status: 0,
        error: error.message,
        endpoint: "/health",
      });
    }
  });

  router.post("/test-chat", verifyToken, async (req, res) => {
    try {
      const response = await axios.post(
        `${process.env.RUNPOD_EMBEDDING_URL}/chat`,
        {
          query: "Test connection", // ✅ Correct format from Postman collection
          history: [],
          top_k: 1,
          temperature: 0.1,
          stream: false,
        },
        {
          headers: {
            Authorization: req.headers.authorization,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      res.json({
        status: 200,
        response: response.data,
        endpoint: "/chat",
      });
    } catch (error) {
      res.status(500).json({
        status: 0,
        error: error.message,
        endpoint: "/chat",
      });
    }
  });

  router.post("/test-embed", verifyToken, async (req, res) => {
    try {
      const response = await axios.post(
        `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
        {
          text: "Test embedding generation for health check",
          normalize: true, // ✅ Based on Postman collection
        },
        {
          headers: {
            Authorization: req.headers.authorization,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      res.json({
        status: 200,
        response: response.data,
        endpoint: "/embed",
      });
    } catch (error) {
      res.status(500).json({
        status: 0,
        error: error.message,
        endpoint: "/embed",
      });
    }
  });

  errorLogger.success("Agent routes created successfully", {
    routes: [
      "GET /api/agent/status",
      "POST /api/agent/start",
      "POST /api/agent/stop",
      "POST /api/agent/health-check",
    ],
    component: "createAgentRouter",
  });

  return router;
}

// Export for backward compatibility
export const agentRouter = createAgentRouter;