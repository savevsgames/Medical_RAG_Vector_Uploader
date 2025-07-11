// Main export module - cleaned up, no legacy routes
import { createAgentRouter } from "./routes/agentRoutes.js";
import { errorLogger } from "./shared/logger.js";

export function mountAgentRoutes(app, supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    throw new Error("Invalid Supabase client provided to mountAgentRoutes");
  }

  errorLogger.info("Mounting agent routes...");

  // Create routers with Supabase client dependency injection
  const agentRouter = createAgentRouter(supabaseClient);

  // Mount agent routes ONLY
  app.use("/api/agent", agentRouter);

  errorLogger.info("Agent routes mounted successfully");
}

// Export services for direct use if needed
export { AgentService } from "./core/agentService.js";
export { errorLogger } from "./shared/logger.js";
