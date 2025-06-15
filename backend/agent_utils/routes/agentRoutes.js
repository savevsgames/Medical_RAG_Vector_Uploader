import express from "express";
import axios from "axios";
import { AgentService } from "../core/agentService.js";
import { ContainerService } from "../core/containerService.js";
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
  const containerService = new ContainerService();

  // Agent Status Operations
  class AgentStatusOperations {
    constructor(agentService, containerService) {
      this.agentService = agentService;
      this.containerService = containerService;
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
          component: "AgentStatusOperations",
        });

        // Check container health if agent is active
        let containerStatus = "unknown";
        let containerHealth = null;

        if (agent.status === "active" || agent.status === "initializing") {
          try {
            const healthCheck = await this.checkContainerHealth(agent);
            containerStatus = healthCheck.status;
            containerHealth = healthCheck.data;
          } catch (healthError) {
            errorLogger.warn("Container health check failed", {
              userId,
              agentId: agent.id,
              error: healthError.message,
              component: "AgentStatusOperations",
            });
            containerStatus = "unreachable";
            containerHealth = { error: healthError.message };
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

    async checkContainerHealth(agent) {
      // Validate session data
      if (!agent.session_data?.runpod_endpoint) {
        throw new Error("No RunPod endpoint configured in session data");
      }

      const healthUrl =
        `${agent.session_data.runpod_endpoint}`.replace(/\/+$/, "") + "/health";

      errorLogger.debug("Checking container health", {
        agentId: agent.id,
        healthUrl,
        component: "AgentStatusOperations",
      });

      try {
        const { status, data } = await axios.get(healthUrl, {
          timeout: 8000,
          headers: { Accept: "application/json" },
        });

        errorLogger.debug("Health-ping response", {
          healthUrl,
          status,
          data,
          component: "AgentStatusOperations",
        });

        if (status !== 200) {
          throw new Error(`Health check HTTP ${status}`);
        }

        return {
          status: "running",
          data: data,
        };
      } catch (error) {
        errorLogger.error("Container health check failed", error, {
          healthUrl,
          error_code: error.code,
          error_status: error.response?.status,
          error_data: error.response?.data,
          component: "AgentStatusOperations",
        });

        return {
          status: "unreachable",
          data: {
            error: error.message,
            code: error.code,
            response_status: error.response?.status,
          },
        };
      }
    }
  }

  // Agent Lifecycle Operations
  class AgentLifecycleOperations {
    constructor(agentService, containerService) {
      this.agentService = agentService;
      this.containerService = containerService;
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

        // Prepare session data with RunPod endpoint
        const sessionData = {
          runpod_endpoint: process.env.RUNPOD_EMBEDDING_URL,
          started_at: new Date().toISOString(),
          capabilities: ["chat", "embed", "health"],
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
    constructor(agentService, containerService) {
      this.agentService = agentService;
      this.containerService = containerService;
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
          const healthCheck = await this.checkContainerHealth(agent);
          healthResults.container_reachable = healthCheck.status === "running";
          healthResults.test_results.health.status =
            healthCheck.status === "running" ? 200 : 500;
          healthResults.test_results.health.response = healthCheck.data;
        } catch (error) {
          healthResults.test_results.health.error = error.message;
        }

        // Test other endpoints if health check passed
        if (healthResults.container_reachable) {
          // Test chat endpoint (simplified)
          try {
            const chatUrl = `${agent.session_data.runpod_endpoint.replace(
              /\/+$/,
              ""
            )}/chat`;
            const { status } = await axios.post(
              chatUrl,
              {
                message: "Test connection",
                context: [],
              },
              {
                timeout: 5000,
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
              }
            );

            healthResults.test_results.chat.status = status;
            healthResults.endpoints_working = true;
          } catch (error) {
            healthResults.test_results.chat.error = error.message;
          }

          // Test embed endpoint (simplified)
          try {
            const embedUrl = `${agent.session_data.runpod_endpoint.replace(
              /\/+$/,
              ""
            )}/embed`;
            const { status } = await axios.post(
              embedUrl,
              {
                text: "Test embedding",
              },
              {
                timeout: 5000,
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
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

    async checkContainerHealth(agent) {
      // Reuse the same logic from AgentStatusOperations
      const statusOps = new AgentStatusOperations(
        this.agentService,
        this.containerService
      );
      return statusOps.checkContainerHealth(agent);
    }
  }

  // Initialize operation classes
  const statusOperations = new AgentStatusOperations(
    agentService,
    containerService
  );
  const lifecycleOperations = new AgentLifecycleOperations(
    agentService,
    containerService
  );
  const healthOperations = new AgentHealthOperations(
    agentService,
    containerService
  );

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
